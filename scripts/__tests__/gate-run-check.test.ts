import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

/**
 * One check, through `run`. `runCheck` runs a check's `setup` and then its
 * `command` through a shell, in the repo root or the check's `cwd` under it; it
 * stops at the first step that fails, naming the check and why it exists, and a
 * step a stop signal ended ends the whole run with that signal's exit code.
 *
 * It runs in process, so v8 coverage sees it. The steps are real shell commands,
 * run in this checkout (the runner's root, resolved from its own URL) and leaving
 * their traces in a throwaway directory. What is not real: the manifest, whose checks are
 * the test's; the Node version check, which would otherwise refuse a test run on
 * a Node other than `.nvmrc`'s; and the machine's lock, moved to a throwaway file
 * through `GATE_LOCK` so the test neither waits for nor blocks a real gate. The
 * run is told it is in the Sandcastle sandbox, so it writes no receipt on this
 * checkout's HEAD.
 */
const manifest = vi.hoisted(() => ({
  checks: [] as {
    name: string;
    command: string;
    setup?: string;
    cwd?: string;
    why: string;
  }[],
}));

vi.mock('../gate/manifest.mjs', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();

  return { ...actual, checksFor: () => manifest.checks };
});

vi.mock('../gate/node-version.mjs', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();

  return { ...actual, compareNodeVersion: () => ({ ok: true, message: '' }) };
});

/** The checkout the runner resolves from its own URL: checks run here. */
const REPO_ROOT = resolve(__dirname, '..', '..');

const SCOPED = ['GATE_LOCK', 'SANDCASTLE_SANDBOX', 'GATE_TIMINGS_FILE'];

type Run = (argv: readonly string[]) => number;

describe('runCheck, through run', () => {
  let run: Run;
  let root: string;
  let saved: Record<string, string | undefined>;
  let out: string;

  const check = (fields: Partial<(typeof manifest.checks)[number]>) => ({
    name: 'probe',
    command: 'true',
    why: 'the probe exists to be run',
    ...fields,
  });

  /** A step that appends `word` to the log at the repo root, wherever it runs. */
  const logs = (word: string) => `echo ${word} >> "${join(root, 'log')}"`;

  const logged = () =>
    existsSync(join(root, 'log'))
      ? readFileSync(join(root, 'log'), 'utf8').trim().split('\n')
      : [];

  beforeAll(async () => {
    // Importing the runner runs it once over `process.argv`. With `--list` that
    // run prints the manifest and runs nothing.
    const argv = process.argv;
    const exitCode = process.exitCode;
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    process.argv = [argv[0] ?? 'node', 'run.mjs', '--list'];
    // @ts-expect-error — plain .mjs with JSDoc types, no declaration file.
    ({ run } = await import('../gate/run.mjs'));
    process.argv = argv;
    process.exitCode = exitCode;
    write.mockRestore();
  });

  beforeEach(() => {
    saved = Object.fromEntries(SCOPED.map((name) => [name, process.env[name]]));
    root = mkdtempSync(join(tmpdir(), 'gate-run-check-'));
    process.env.GATE_LOCK = join(root, 'gate.lock');
    process.env.SANDCASTLE_SANDBOX = '1';
    delete process.env.GATE_TIMINGS_FILE;
    manifest.checks = [];
    out = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      out += String(chunk);
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(root, { recursive: true, force: true });
  });

  afterAll(() => {
    vi.doUnmock('../gate/manifest.mjs');
    vi.doUnmock('../gate/node-version.mjs');
  });

  it('runs a check with no setup in the repo root and passes it', () => {
    // Arrange
    manifest.checks = [check({ command: `pwd > "${join(root, 'cwd')}"` })];

    // Act
    const code = run([]);

    // Assert
    expect(code).toBe(0);
    expect(out).toContain('\n→ probe\n');
    expect(readFileSync(join(root, 'cwd'), 'utf8').trim()).toBe(REPO_ROOT);
    expect(out).toContain('✓ gate (fast) — 1 check(s)');
  });

  it('runs the setup before the command, in the check’s cwd', () => {
    // Arrange
    manifest.checks = [
      check({
        cwd: 'scripts',
        setup: `${logs('setup')} && pwd > "${join(root, 'cwd')}"`,
        command: logs('command'),
      }),
    ];

    // Act
    const code = run([]);

    // Assert
    expect(code).toBe(0);
    expect(logged()).toEqual(['setup', 'command']);
    expect(readFileSync(join(root, 'cwd'), 'utf8').trim()).toBe(
      join(REPO_ROOT, 'scripts'),
    );
  });

  it('fails a check whose setup fails, naming why it exists, and skips its command', () => {
    // Arrange
    manifest.checks = [check({ setup: 'exit 1', command: logs('command') })];

    // Act
    const code = run([]);

    // Assert
    expect(code).toBe(1);
    expect(out).toContain('\n✗ probe — the probe exists to be run\n');
    expect(logged()).toEqual([]);
    expect(out).toContain('✗ gate (fast) — probe');
  });

  it('fails a check whose command fails and still runs the next check', () => {
    // Arrange
    manifest.checks = [
      check({ name: 'red', command: 'exit 3', why: 'red is red' }),
      check({ name: 'next', command: logs('next') }),
    ];

    // Act
    const code = run([]);

    // Assert
    expect(code).toBe(1);
    expect(out).toContain('\n✗ red — red is red\n');
    expect(logged()).toEqual(['next']);
    expect(out).toContain('✗ gate (fast) — red\n');
  });

  it('ends the run with the signal’s exit code when a stop signal ended a step', () => {
    // Arrange — a shell reports a child Ctrl-C ended as 128 + SIGINT.
    manifest.checks = [
      check({ name: 'stopped', command: 'exit 130' }),
      check({ name: 'never', command: logs('never') }),
    ];

    // Act
    const code = run([]);

    // Assert
    expect(code).toBe(130);
    expect(out).not.toContain('✗ stopped');
    expect(out).not.toContain('→ never');
    expect(logged()).toEqual([]);
  });
});
