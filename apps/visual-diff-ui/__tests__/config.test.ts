import * as fs from 'node:fs';
import * as path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';

/**
 * Two traps this app fell into, held shut.
 *
 * Neither is visible to any other test here: both pass every unit suite, every
 * typecheck and the build, and only fail in a running production server — one as
 * a job that dies after its first log line, the other as a 500 answered by a
 * mutation that already happened. They are guarded structurally for the same
 * reason the design system unit-tests its stylesheet rules: pixels cannot see
 * them, and neither can a mock.
 */

const APP_ROOT = process.cwd();

/** Every `.ts` file under the app's own source directories, app-relative. */
function sourceFiles(): string[] {
  return ['app', 'lib', 'components'].flatMap((dir) =>
    fs
      .readdirSync(path.join(APP_ROOT, dir), { recursive: true })
      .map((name) => path.join(dir, String(name)))
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx')),
  );
}

const read = (file: string) => fs.readFileSync(path.join(APP_ROOT, file), 'utf8');

/** Only the field the case below asks about — the rest of the file is not this
 *  suite's business. */
interface Tsconfig {
  compilerOptions?: { paths?: Record<string, string[]> };
}

/** `tsconfig.json` is JSONC — this app's comments are all whole-line. */
function readTsconfig(): Tsconfig {
  const withoutComments = read('tsconfig.json')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');

  return JSON.parse(withoutComments) as Tsconfig;
}

describe('module resolution', () => {
  /**
   * Turbopack reads `tsconfig.json`'s `paths` as RESOLUTION, not just as types.
   * A mapping onto a declaration file therefore builds the SERVER from that
   * file — which exports nothing at all — and every job died with
   * `(void 0) is not a function` right after its first log line, in a build that
   * typechecked and passed every suite here.
   *
   * The types those declarations exist for are read through ambient
   * `declare module` blocks instead (types/visual-diff/*.d.ts), which TypeScript
   * consults and no bundler ever sees.
   */
  it('maps no module specifier onto a declaration file', () => {
    const paths = readTsconfig().compilerOptions?.paths ?? {};

    const declarations = Object.entries(paths).filter(([, targets]) =>
      targets.some((target) => target.endsWith('.d.ts')),
    );

    expect(declarations).toEqual([]);
  });
});

/**
 * Every module `entry` reaches through a RUNTIME import, itself included.
 *
 * `import type` is skipped on purpose and it is the whole subtlety here: a type
 * import erases at compile time and pulls nothing into any bundle, so a client
 * component naming a type out of a filesystem module is safe — and safe because of
 * how the import was WRITTEN, which is not something the module it names can rely
 * on. These walks are what turn that into a property of the graph.
 *
 * Relative specifiers only. A package is not this app's to vouch for, and the ones
 * that matter here (`zod`, `@gate/visual-diff/policy`) are isomorphic by
 * construction.
 */
function runtimeGraph(entry: string): string[] {
  const seen = new Set<string>();

  const walk = (file: string) => {
    const candidates = [file, `${file}.ts`, `${file}.tsx`];
    const resolved = candidates.find((name) => fs.existsSync(path.join(APP_ROOT, name)));
    if (!resolved || seen.has(resolved)) return;
    seen.add(resolved);

    for (const match of read(resolved).matchAll(
      /import\s+(type\s+)?[^;]*?from '([^']+)'/g,
    )) {
      const [, isType, spec] = match;
      if (isType || !spec) continue;

      if (spec.startsWith('.')) walk(path.join(path.dirname(resolved), spec));
      else if (spec.startsWith('@/')) walk(spec.slice(2));
    }
  };

  walk(entry);

  return [...seen];
}

/** Whether that module names a Node builtin or a `next/*` entry point directly. */
const reachesNode = (file: string) => /from 'node:/.test(read(file));

describe('the client-safe contract', () => {
  /**
   * lib/job-contract.ts states one thing about itself and it is a build-time
   * property: no `node:` import, anywhere in what it pulls in. That is what lets
   * a client component name a job's shapes.
   *
   * Guarded structurally because the failure is invisible to everything else
   * here. A value import from the wrong module typechecks, passes every suite in
   * this directory, and fails only `next build` — measured, not assumed: reaching
   * `JobRequestSchema` through lib/jobs.ts fails with `It is not allowed to define
   * inline "use cache" annotated functions in Client Components`, because that
   * module reaches lib/baselines.ts and the cached readers behind it. Reaching the
   * same schema through lib/job-contract.ts compiles.
   */
  it('reaches no node: builtin from the contract or anything it imports', () => {
    const graph = runtimeGraph('lib/job-contract.ts');

    expect(graph.filter(reachesNode)).toEqual([]);
    // The walk reached something, rather than passing because it found nothing.
    expect(graph.length).toBeGreaterThan(0);
  });

  /**
   * The same rule for lib/api-contract.ts, which states it for the same reason
   * and is the one place it had to be earned rather than inherited: the schemas
   * there describe what four route handlers ANSWER with, and a handler is
   * exactly the kind of module that reaches the filesystem two imports down.
   * The run panel, the prune dialog and the job poller all value-import it.
   */
  it('reaches no node: builtin from the response contract', () => {
    const graph = runtimeGraph('lib/api-contract.ts');

    expect(graph.filter(reachesNode)).toEqual([]);
    // The walk reached the job contract, rather than passing because it found
    // nothing: `HistoryRecordSchema` is most of what `/api/jobs/current` says.
    expect(graph).toContain('lib/job-contract.ts');
  });

  /**
   * The same rule for lib/refusal-copy.ts, which exists for the same reason: the
   * run panel renders three of its sentences and cannot import lib/refusals.ts,
   * where the responses that carry them live.
   */
  it('reaches no node: builtin from the refusal copy', () => {
    expect(runtimeGraph('lib/refusal-copy.ts').filter(reachesNode)).toEqual([]);
  });

  /**
   * The generalisation, and the one that would have caught both of the above
   * before they were problems: nothing a client component RUNS may reach the
   * filesystem.
   *
   * The two components this was written for no longer test it. `RunPanel` named
   * `RunnerEnv` out of lib/host.ts, which reaches `node:child_process` through
   * lib/docker.ts, and `StoryTier` out of lib/stories.ts, which reaches
   * `node:fs` directly; `FilterPicker` named `StoryTier` too. All three were
   * `import type` and erased — safe because of how the import was WRITTEN, one
   * keyword from not being. Both shapes are declared in lib/api-contract.ts now,
   * which the case above holds client-safe, so those imports are safe by what
   * they NAME.
   *
   * The rule stays, because the next such import is one edit away and this is
   * the only thing that would report it — before `next build` does, with a
   * message about `use cache`.
   */
  it('runs nothing that reaches the filesystem from a client component', () => {
    const offenders = sourceFiles()
      .filter((file) => /^\s*'use client';/m.test(read(file)))
      .flatMap((file) =>
        runtimeGraph(file)
          .filter(reachesNode)
          .map((reached) => `${file} -> ${reached}`),
      );

    expect(offenders).toEqual([]);
  });
});

describe('the pure view layer', () => {
  /**
   * The modules a report is rendered from derive and format; they do not read,
   * and they do not know they are in Next.
   *
   * Stated as a rule rather than left to review because it is what lets the
   * component suites render a whole report out of literal rows with no filesystem
   * and no request — which is most of what makes them fast enough to be worth
   * having.
   */
  it.each([
    'lib/report-view.ts',
    'lib/outcome.ts',
    'lib/comparison.ts',
    'lib/title.ts',
    'lib/shots.ts',
    'lib/summary.ts',
  ])('keeps %s free of node: and next/', (module) => {
    const reaching = runtimeGraph(module).filter(
      (file) => reachesNode(file) || /from 'next\//.test(read(file)),
    );

    expect(reaching).toEqual([]);
  });
});

describe('cache invalidation', () => {
  /**
   * `updateTag` is Server-Action-only: called from a route handler Next throws
   * `updateTag can only be called from within a Server Action`, and the handler
   * answers 500 — after the delete or the prune has already happened. A reviewer
   * then reads "could not delete" over a set that is gone.
   *
   * `revalidateTag` is the one that works from a route handler, which is where
   * every invalidation in this app now happens — see the case below for where it
   * emphatically does not work.
   */
  it('never invalidates a tag with the Server-Action-only API', () => {
    // The call, not the name: lib/data.ts names `updateTag` in prose, to say
    // why the window beside every `revalidateTag` here is zero.
    const callers = sourceFiles().filter((file) => /\bupdateTag\s*\(/.test(read(file)));

    expect(callers).toEqual([]);
  });

  /**
   * `revalidateTag` appends to the request store's `pendingRevalidatedTags`, and
   * `executeRevalidates` drains that array at the END of the request. Called
   * from anywhere with no request still in flight, it therefore does nothing —
   * and, because AsyncLocalStorage keeps the finished request's store reachable
   * from a detached continuation, it does nothing SILENTLY. No throw, nothing
   * for a `catch` to see.
   *
   * That is not hypothetical. `lib/jobs.ts` purged three tags from the tail of a
   * finished job for as long as this app has had one, so a capture that had
   * already written its set left the console showing the list from before it,
   * and `__tests__/jobs.test.ts` asserted the CALL and stayed green throughout.
   * A job now records what it made stale and `GET /api/jobs/current` purges it
   * on the next poll, inside a request.
   *
   * Stated as "only route handlers" rather than as a list of today's callers, so
   * it goes on holding when one is added or removed. Server Actions would be
   * legal too — this app has none.
   */
  it('invalidates no tag outside a request handler', () => {
    const callers = sourceFiles()
      .filter((file) => /\brevalidateTag\s*\(/.test(read(file)))
      .filter((file) => !/^app\/.*\/route\.ts$/.test(file));

    expect(callers).toEqual([]);
  });
});

/**
 * Where the dev server listens, which is a security property and not a
 * convenience.
 *
 * `next dev` with no `-H` binds every interface, so a console started against a
 * real data directory answers the whole LAN — the café wifi, the tailnet — and
 * `Host` is a header a non-browser client writes for itself. `curl -H 'Host:
 * localhost' -X POST http://<dev-machine-ip>:3300/api/prune -d '{"keep":0}'`
 * therefore passed the local gate and deleted every capture set, and no unit
 * test could see it: `isLocalHost` was answering exactly as designed about a
 * header that was a lie.
 *
 * Pinned structurally because nothing else can hold it. It is one flag in one
 * script, it looks like noise in a diff, and the failure it prevents is
 * invisible from inside the process — `guardMutation` gets the same request
 * either way. lib/provenance.ts is the other half of that fix and closes the
 * browser half; this is the half that closes this one.
 */
describe('the dev server address', () => {
  it('binds the dev server to loopback rather than to every interface', () => {
    const { scripts } = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>;
    };

    expect(scripts.dev).toContain('next dev -H 127.0.0.1');
  });
});
