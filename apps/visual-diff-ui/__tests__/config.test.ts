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

describe('cache invalidation', () => {
  /**
   * `updateTag` is Server-Action-only: called from a route handler Next throws
   * `updateTag can only be called from within a Server Action`, and the handler
   * answers 500 — after the delete or the prune has already happened. A reviewer
   * then reads "could not delete" over a set that is gone.
   *
   * `revalidateTag` is the one that works everywhere this app invalidates from:
   * two route handlers, and the detached tail of a finished job.
   */
  it('never invalidates a tag with the Server-Action-only API', () => {
    // The call, not the name: lib/data.ts names `updateTag` in prose, to say
    // why the window beside every `revalidateTag` here is zero.
    const callers = sourceFiles().filter((file) => /\bupdateTag\s*\(/.test(read(file)));

    expect(callers).toEqual([]);
  });
});
