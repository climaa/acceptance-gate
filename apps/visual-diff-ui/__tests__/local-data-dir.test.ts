import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SetsFileSchema } from '../lib/summary';

/**
 * The data directory `pnpm dev` prepares before `next dev` starts.
 *
 * The script is a command with no exports — it does its work when it is
 * evaluated, reading its target from `process.argv`. So each case sets the argv,
 * stubs `process.exit` to throw rather than end the worker, and imports a fresh
 * evaluation of the module. In-process rather than spawned on purpose: a child
 * `node` is invisible to v8 coverage, and the file is on this suite's include.
 *
 * What it promises: an empty registry the console can start its first job from,
 * and never a byte of an existing corpus overwritten.
 */

const temporaryDirs: string[] = [];
const originalArgv = process.argv;

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-data-dir-'));
  temporaryDirs.push(dir);
  return dir;
}

class ExitCalled extends Error {
  constructor(readonly code: number | string | null | undefined) {
    super(`process.exit(${String(code)})`);
  }
}

/** Evaluates the script once with `args` after `node <script>`. */
async function runScript(...args: string[]): Promise<void> {
  process.argv = ['node', 'scripts/local-data-dir.mjs', ...args];
  vi.resetModules();
  await import('../scripts/local-data-dir.mjs');
}

beforeEach(() => {
  vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new ExitCalled(code);
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
  for (const dir of temporaryDirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe('local-data-dir', () => {
  it('creates a missing directory, nested, with an empty registry the console parses', async () => {
    const target = path.join(tempDir(), 'nested', '.visual-diff');

    await runScript(target);

    const registry = JSON.parse(fs.readFileSync(path.join(target, 'sets.json'), 'utf8'));
    expect(SetsFileSchema.parse(registry)).toEqual({ sets: [] });
  });

  it('never claims the sample flag the committed fixture carries', async () => {
    const target = tempDir();

    await runScript(target);

    const registry = JSON.parse(fs.readFileSync(path.join(target, 'sets.json'), 'utf8'));
    expect(registry).not.toHaveProperty('isSample');
  });

  it('seeds an existing but empty directory — the case resolveDataDir reads as "no data"', async () => {
    const target = tempDir();

    await runScript(target);

    expect(fs.readdirSync(target)).toEqual(['sets.json']);
  });

  it('leaves an existing registry byte-for-byte alone', async () => {
    const target = tempDir();
    const corpus = '{"sets":[{"label":"mine"}]}';
    fs.writeFileSync(path.join(target, 'sets.json'), corpus);

    await runScript(target);

    expect(fs.readFileSync(path.join(target, 'sets.json'), 'utf8')).toBe(corpus);
  });

  it('resolves a relative target and names the absolute directory it prepared', async () => {
    const parent = tempDir();
    vi.spyOn(process, 'cwd').mockReturnValue(parent);

    await runScript('relative-data');

    expect(fs.existsSync(path.join(parent, 'relative-data', 'sets.json'))).toBe(true);
    expect(console.log).toHaveBeenCalledWith(
      `visual-diff data directory: ${path.join(parent, 'relative-data')}`,
    );
  });

  it('refuses to run without a target, exiting 1 before touching the disk', async () => {
    const cwd = tempDir();
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);

    const run = runScript();

    await expect(run).rejects.toEqual(new ExitCalled(1));
    expect(console.error).toHaveBeenCalledWith(
      '✗ local-data-dir: needs a target directory',
    );
    expect(console.log).not.toHaveBeenCalled();
    expect(fs.readdirSync(cwd)).toEqual([]);
  });
});
