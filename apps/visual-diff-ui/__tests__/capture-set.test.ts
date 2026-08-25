import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSet, filtersOf, isDirty, parseArgs } from '../scripts/capture-set.mjs';
import { SetsFileSchema } from '../lib/summary';

/**
 * The argv seam, run from both ends.
 *
 * `lib/runner.ts` builds an argv and spawns `scripts/capture-set.mjs` with it —
 * through `docker run` from a developer's machine, directly when the console is
 * already on the pinned image. Until now both ends were asserted and neither was
 * ever run against the other: `runner.test.ts` mocks `spawn` and stops at the
 * strings, and the script could not be imported at all, because `check` reaches
 * for a browser and the pinned image at module scope.
 *
 * That is the gap `--dirty` lived in. The runner sent `--dirty false`, the script
 * read any `--dirty` as a switch, and `false` is a non-empty string — so every
 * real capture recorded a clean tree while both suites stayed green. Two correct
 * halves and no test that put them together.
 *
 * The cases below take the argv `lib/runner.ts` ACTUALLY emits — through the same
 * spawn mock that pins it, not a copy of it — and hand it to the real parser. No
 * string is written twice, so a flag renamed on either side fails here.
 */

const REPO_ROOT = path.resolve(process.cwd(), '..', '..');
const SCRIPT = path.join(process.cwd(), 'scripts', 'capture-set.mjs');

const temporaryDirs: string[] = [];

afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-capture-seam-'));
  temporaryDirs.push(dir);

  return dir;
}

/**
 * The argv `runCheck` hands the capture script, taken off a faked `spawn`.
 *
 * Only `spawn` is faked, as `runner.test.ts` states for its own copy:
 * `execFileSync` is what `describeCheckout` reads git with, and stubbing it would
 * hand the container a provenance this repo never claimed — which is one of the
 * things these cases are here to check.
 */
async function argvFromRunner(
  request: Parameters<typeof import('../lib/runner').runCheck>[1],
): Promise<string[]> {
  const started: { command: string; args: string[] }[] = [];

  vi.resetModules();
  const real =
    await vi.importActual<typeof import('node:child_process')>('node:child_process');
  vi.doMock('node:child_process', () => ({
    ...real,
    spawn: (command: string, args: string[]) => {
      started.push({ command, args });
      const child = new EventEmitter() as EventEmitter & {
        stdout: Readable;
        stderr: Readable;
      };
      child.stdout = Readable.from([]);
      child.stderr = Readable.from([]);
      queueMicrotask(() => child.emit('close', 0));

      return child;
    },
  }));

  try {
    const { runCheck } = await import('../lib/runner');
    await runCheck(makeDataDir(), request, () => {});
  } finally {
    vi.doUnmock('node:child_process');
    vi.resetModules();
  }

  // [0] is the Storybook build; [1] is the capture — the same index
  // `runner.test.ts` reads.
  return started[1]?.args ?? [];
}

describe('the argv the runner emits, read by the parser that receives it', () => {
  it('carries the label the capture was asked for', async () => {
    const argv = await argvFromRunner({ mode: 'capture', label: 'main-2026-08-17' });

    expect(parseArgs(argv).label).toBe('main-2026-08-17');
  });

  it('names a root and a data directory the script can resolve', async () => {
    const args = parseArgs(await argvFromRunner({ mode: 'capture', label: 'a-set' }));

    // The script refuses without all three, so this is the shape of "runnable"
    // rather than three separate facts.
    expect(typeof args.root).toBe('string');
    expect(typeof args['data-dir']).toBe('string');
    expect(typeof args.label).toBe('string');
  });

  /**
   * The defect this seam is named for. The runner sends git's answer as a string;
   * the parser has to read `'false'` as false, and any `--dirty` at all used to
   * read as true.
   */
  it('round-trips the dirty flag as the boolean git meant', async () => {
    const argv = await argvFromRunner({ mode: 'capture', label: 'a-set' });
    const sent = argv[argv.indexOf('--dirty') + 1];

    expect(['true', 'false']).toContain(sent);
    expect(isDirty(parseArgs(argv).dirty)).toBe(sent === 'true');
  });

  /** One `--filter` per ticked component, collected back into the union
   *  `matchesFilter` reads — a last-one-wins parser would capture a single
   *  component out of a set of five. */
  it('round-trips every filter the reviewer ticked', async () => {
    const filter = ['Button', 'Badge', 'Prose'];
    const argv = await argvFromRunner({ mode: 'capture', label: 'a-set', filter });

    expect(filtersOf(parseArgs(argv))).toEqual(filter);
  });

  it('asks for the whole corpus when nothing was ticked', async () => {
    const argv = await argvFromRunner({ mode: 'capture', label: 'a-set', filter: [] });

    // Absent, never an empty list: the differ reads no filter as everything, and
    // a `--filter` with nothing after it would be a flag with no value.
    expect(argv).not.toContain('--filter');
    expect(filtersOf(parseArgs(argv))).toBeUndefined();
  });

  /** A single ticked component is the case a parser collecting into arrays gets
   *  wrong in the other direction — one value must not become one character per
   *  element. */
  it('round-trips a single filter as a list of one', async () => {
    const argv = await argvFromRunner({
      mode: 'capture',
      label: 'a-set',
      filter: ['Prose'],
    });

    expect(filtersOf(parseArgs(argv))).toEqual(['Prose']);
  });
});

describe('the row a capture writes', () => {
  const meta = { label: 'main-2026-08-17', stories: 154, capturedAt: '2026-08-25' };

  /** The registry the app reads back through zod, so the row is checked against
   *  the same schema rather than against a second description of it. */
  const parsedRow = (args: Parameters<typeof buildSet>[0]) =>
    SetsFileSchema.parse({ sets: [buildSet(args, meta)] }).sets[0];

  it('records the provenance the runner passed', async () => {
    const args = parseArgs(await argvFromRunner({ mode: 'capture', label: meta.label }));
    const row = parsedRow(args);

    expect(row?.label).toBe(meta.label);
    expect(row?.stories).toBe(154);
    expect(row?.sha).toBe(args.sha);
    expect(row?.branch).toBe(args.branch);
  });

  it('parses against the schema the console reads the registry with', async () => {
    const args = parseArgs(await argvFromRunner({ mode: 'capture', label: meta.label }));

    expect(() => SetsFileSchema.parse({ sets: [buildSet(args, meta)] })).not.toThrow();
  });

  it('says unknown rather than nothing when git could not answer', () => {
    const row = parsedRow({});

    expect(row?.sha).toBe('unknown');
    expect(row?.branch).toBe('unknown');
  });

  /** Absent, not false. A capture run by hand did not check the tree, and a row
   *  saying `dirty: false` claims someone looked. */
  it('omits dirty entirely when nothing was passed', () => {
    expect(parsedRow({})).not.toHaveProperty('dirty');
  });

  it.each([
    ['true', true],
    ['false', false],
  ] as const)('records --dirty %s as %s', (sent, expected) => {
    expect(parsedRow({ dirty: sent })?.dirty).toBe(expected);
  });
});

describe('parseArgs on the shapes argv can take', () => {
  it('reads a flag with nothing after it as a switch', () => {
    expect(parseArgs(['--dirty'])).toEqual({ dirty: true });
  });

  it('reads a flag followed by another flag as a switch', () => {
    expect(parseArgs(['--dirty', '--label', 'x'])).toEqual({ dirty: true, label: 'x' });
  });

  it('ignores a bare value with no flag in front of it', () => {
    expect(parseArgs(['stray', '--label', 'x'])).toEqual({ label: 'x' });
  });

  it('collects a repeated flag rather than keeping the last', () => {
    expect(parseArgs(['--filter', 'a', '--filter', 'b', '--filter', 'c']).filter).toEqual(
      ['a', 'b', 'c'],
    );
  });

  it('is empty for empty argv', () => {
    expect(parseArgs([])).toEqual({});
  });
});

/**
 * The guard itself, run rather than reasoned about.
 *
 * Every case above depends on the module importing inert, and the capture depends
 * on it running when node is pointed at it. Both directions are spawned here,
 * because the failure mode on the second one is silent: a guard that does not fire
 * exits 0 having captured nothing, and a job whose exit code is 0 is a job the
 * console reports as succeeded.
 */
describe('the main() guard', () => {
  const runScript = (target: string) =>
    spawnSync(process.execPath, [target], { encoding: 'utf8' });

  it('runs when node is pointed at the file', () => {
    const run = runScript(SCRIPT);

    // No argv, so it stops at its own usage check — which it only reaches by
    // having run at all.
    expect(run.stdout).toContain('needs --root, --data-dir and --label');
    expect(run.status).toBe(2);
  });

  /**
   * The case that was broken when this guard was first written, and the reason it
   * compares real paths.
   *
   * `import.meta.url` is already resolved through symlinks; `process.argv[1]` is
   * the string the caller typed. Compared raw, a checkout reached through a
   * symlink fails the test and the script exits 0 having done nothing — and on
   * macOS every `/tmp` path is exactly that symlink, `/tmp` against `/private/tmp`.
   */
  it('runs when it was reached through a symlink', () => {
    const link = path.join(makeDataDir(), 'linked-scripts');
    fs.symlinkSync(path.dirname(SCRIPT), link);

    const run = runScript(path.join(link, path.basename(SCRIPT)));

    expect(run.stdout).toContain('needs --root, --data-dir and --label');
    expect(run.status).toBe(2);
  });

  it('does nothing at all when it is imported', () => {
    const run = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', `await import(${JSON.stringify(SCRIPT)});`],
      { encoding: 'utf8' },
    );

    expect(run.stdout).toBe('');
    expect(run.status).toBe(0);
  });
});

describe('importing the script', () => {
  /**
   * The property every case above depends on: the module runs nothing on import.
   *
   * `check` reaches for a Storybook build, a browser and the pinned image, so a
   * module that called it at import could not be loaded here at all — which is
   * exactly what kept this seam untested. The guard is `process.argv[1]`, and this
   * is what stops someone helpfully removing it.
   */
  it('captures nothing, and exposes only what it can safely expose', async () => {
    const exported = await import('../scripts/capture-set.mjs');

    expect(Object.keys(exported).sort()).toEqual([
      'buildSet',
      'filtersOf',
      'isDirty',
      'parseArgs',
    ]);
  });

  it('leaves the checkout alone', () => {
    // The capture writes into `<dataDir>/sets/`; importing it must not have
    // created one anywhere near this repo.
    expect(fs.existsSync(path.join(REPO_ROOT, 'sets'))).toBe(false);
  });
});
