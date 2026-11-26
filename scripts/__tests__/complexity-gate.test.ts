import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';

/**
 * The cognitive-complexity gate: runs `fallow health --format json`, keeps the
 * findings in scope, and exits 1 when any function is over the ceiling of 20.
 * Workspace mode scopes fallow to the cwd's workspace; `--scope <path>` analyses
 * the repo and keeps findings under that path prefix.
 *
 * The script does all of that at import, with no exports, so each test imports it
 * fresh with fallow (`execFileSync`), the disk (`existsSync`) and the cwd standing
 * in for the real repo. Nothing is spawned.
 */
const { execFileSync, existsSync } = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({ execFileSync }));
vi.mock('node:fs', () => ({ existsSync }));

const SCRIPT = '../complexity-gate.mjs';
const ROOT = '/repo';
const FALLOW = `${ROOT}/node_modules/.bin/fallow`;

type Finding = { name: string; path?: string; line: number; cognitive?: number };

const report = (findings: unknown) => JSON.stringify({ findings });

/** A filesystem where the repo root has its workspace marker and fallow installed. */
function stubDisk({ fallow = true, marker = true } = {}) {
  existsSync.mockImplementation(
    (path: string) =>
      (marker && path === `${ROOT}/pnpm-workspace.yaml`) || (fallow && path === FALLOW),
  );
}

describe('complexity-gate', () => {
  const argv = process.argv;
  let log: MockInstance<typeof console.log>;
  let error: MockInstance<typeof console.error>;
  let exit: MockInstance<typeof process.exit>;

  const stdout = () => log.mock.calls.map(([line]) => String(line)).join('\n');
  const stderr = () => error.mock.calls.map(([line]) => String(line)).join('\n');

  const run = async ({ cwd = `${ROOT}/apps/web`, flags = [] as string[] } = {}) => {
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    process.argv = [...argv, ...flags];
    vi.resetModules();
    // A variable specifier: the script ships no types, and it is run here, not called.
    await import(/* @vite-ignore */ SCRIPT);
  };

  beforeEach(() => {
    stubDisk();
    execFileSync.mockReturnValue(report([]));
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
    exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    process.argv = argv;
    vi.restoreAllMocks();
    execFileSync.mockReset();
    existsSync.mockReset();
  });

  describe('workspace mode', () => {
    it('runs the installed fallow from the repo root, scoped to the cwd workspace', async () => {
      await run({ cwd: `${ROOT}/apps/web` });

      expect(execFileSync).toHaveBeenCalledTimes(1);
      const [bin, args, options] = execFileSync.mock.calls[0]!;
      expect(bin).toBe(FALLOW);
      expect(args).toEqual([
        'health',
        '--workspace',
        'apps/web',
        '--format',
        'json',
        '--quiet',
      ]);
      expect(options).toMatchObject({ cwd: ROOT, encoding: 'utf8' });
    });

    it('passes when no function is over the ceiling', async () => {
      execFileSync.mockReturnValue(
        report([
          { name: 'atCeiling', path: 'apps/web/a.ts', line: 1, cognitive: 20 },
          { name: 'unscored', path: 'apps/web/b.ts', line: 2 },
        ]),
      );

      await run();

      expect(stdout()).toBe('✓ apps/web/ complexity OK — no function over cognitive 20.');
      expect(error).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
    });

    it('names the root workspace "./" when run from the repo root', async () => {
      await run({ cwd: ROOT });

      expect(execFileSync.mock.calls[0]![1]).toContain('.');
      expect(stdout()).toContain('✓ ./ complexity OK');
    });

    it('keeps every finding fallow returns, whatever its path', async () => {
      execFileSync.mockReturnValue(
        report([{ name: 'elsewhere', path: 'packages/x/y.ts', line: 3, cognitive: 21 }]),
      );

      await run();

      expect(stderr()).toContain('cog 21  elsewhere  (packages/x/y.ts:3)');
      expect(exit).toHaveBeenCalledWith(1);
    });
  });

  describe('over the ceiling', () => {
    it('lists every offender, worst first, and exits 1', async () => {
      const findings: Finding[] = [
        { name: 'mild', path: 'apps/web/a.ts', line: 10, cognitive: 21 },
        { name: 'fine', path: 'apps/web/b.ts', line: 20, cognitive: 5 },
        { name: 'worst', path: 'apps/web/c.ts', line: 30, cognitive: 44 },
      ];
      execFileSync.mockReturnValue(report(findings));

      await run();

      expect(error.mock.calls.map(([line]) => String(line))).toEqual([
        '✗ cognitive-complexity ceiling (20) exceeded in apps/web/',
        '    cog 44  worst  (apps/web/c.ts:30)',
        '    cog 21  mild  (apps/web/a.ts:10)',
        expect.stringContaining('Extract a helper to lower cognitive load'),
      ]);
      expect(stderr()).not.toContain('fine');
      expect(exit).toHaveBeenCalledWith(1);
    });
  });

  describe('path mode (--scope)', () => {
    it('analyses the whole repo and keeps only findings under the prefix', async () => {
      execFileSync.mockReturnValue(
        report([
          { name: 'inScope', path: '.sandcastle/plan.mts', line: 4, cognitive: 25 },
          { name: 'outOfScope', path: 'apps/web/a.ts', line: 5, cognitive: 90 },
          { name: 'pathless', line: 6, cognitive: 90 },
        ]),
      );

      await run({ cwd: ROOT, flags: ['--scope', '.sandcastle'] });

      expect(execFileSync.mock.calls[0]![1]).toEqual([
        'health',
        '--format',
        'json',
        '--quiet',
      ]);
      expect(stderr()).toContain('exceeded in .sandcastle/');
      expect(stderr()).toContain('cog 25  inScope  (.sandcastle/plan.mts:4)');
      expect(stderr()).not.toContain('outOfScope');
      expect(stderr()).not.toContain('pathless');
      expect(exit).toHaveBeenCalledWith(1);
    });

    it('does not double a trailing slash, and does not match a sibling prefix', async () => {
      execFileSync.mockReturnValue(
        report([
          { name: 'sibling', path: '.sandcastle-old/x.mts', line: 1, cognitive: 99 },
        ]),
      );

      await run({ cwd: ROOT, flags: ['--scope', '.sandcastle/'] });

      expect(stdout()).toBe(
        '✓ .sandcastle/ complexity OK — no function over cognitive 20.',
      );
      expect(exit).not.toHaveBeenCalled();
    });
  });

  describe('reading fallow', () => {
    it('still gates on the JSON when fallow exits 1 for advisory findings', async () => {
      execFileSync.mockImplementation(() => {
        throw Object.assign(new Error('Command failed'), {
          stdout: Buffer.from(
            report([{ name: 'deep', path: 'apps/web/a.ts', line: 7, cognitive: 30 }]),
          ),
        });
      });

      await run();

      expect(stderr()).toContain('cog 30  deep  (apps/web/a.ts:7)');
      expect(exit).toHaveBeenCalledWith(1);
    });

    it('rethrows a fallow failure that produced no output', async () => {
      execFileSync.mockImplementation(() => {
        throw new Error('spawn EACCES');
      });

      await expect(run()).rejects.toThrow('spawn EACCES');
    });

    it('passes when the report carries no findings array', async () => {
      execFileSync.mockReturnValue(JSON.stringify({ summary: {} }));

      await run();

      expect(stdout()).toContain('✓ apps/web/ complexity OK');
      expect(exit).not.toHaveBeenCalled();
    });

    it('fails with an install hint when fallow is not installed', async () => {
      stubDisk({ fallow: false });

      await expect(run()).rejects.toThrow(
        `fallow binary not found at ${FALLOW} — run \`pnpm install\` first.`,
      );
      expect(execFileSync).not.toHaveBeenCalled();
    });

    it('treats the cwd as the root when no pnpm-workspace.yaml is above it', async () => {
      stubDisk({ marker: false });

      await expect(run({ cwd: `${ROOT}/apps/web` })).rejects.toThrow(
        `fallow binary not found at ${ROOT}/apps/web/node_modules/.bin/fallow`,
      );
    });
  });
});
