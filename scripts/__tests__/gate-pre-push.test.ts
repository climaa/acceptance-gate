import { execFileSync, spawnSync as realSpawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
 * Verifying one pushed sha. `verify` is what `run` calls per ref line: a sha
 * whose tree already carries a receipt passes as it is, the Sandcastle sandbox
 * refuses one that does not, and the host runs `run.mjs` — over the working tree
 * when the sha is HEAD, with `--at <sha>` otherwise — and writes the receipt
 * only when that run passed.
 *
 * It runs in process, so v8 coverage sees it. git is real, against a throwaway
 * repository named through `GIT_DIR` and `GIT_WORK_TREE` (the hook calls git with
 * no `cwd`). The runner is not: `spawnSync('node', [run.mjs, …])` is answered by
 * a stand-in that records its arguments, writes the timings file the hook named,
 * and exits with the status the test chose. Every other `spawnSync` is git's and
 * goes through untouched.
 */
const runner = vi.hoisted(() => ({
  status: 0 as number | null,
  calls: [] as { args: readonly string[]; env: NodeJS.ProcessEnv }[],
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();

  return {
    ...actual,
    spawnSync: (
      command: string,
      args: readonly string[],
      options: { env?: NodeJS.ProcessEnv },
    ) => {
      if (command !== 'node') return actual.spawnSync(command, args, options as never);

      const env = options.env ?? {};
      runner.calls.push({ args: args.slice(1), env });
      const timings = env.GATE_TIMINGS_FILE;
      if (timings !== undefined) {
        writeFileSync(timings, JSON.stringify({ waitedMs: 3, ranMs: 7 }));
      }

      return { status: runner.status };
    },
  };
});

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Gate Test',
  GIT_AUTHOR_EMAIL: 'gate@test.invalid',
  GIT_COMMITTER_NAME: 'Gate Test',
  GIT_COMMITTER_EMAIL: 'gate@test.invalid',
};

const SCOPED = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'SANDCASTLE_SANDBOX',
  'SC_SKIP_GATE',
  ...Object.keys(GIT_ENV),
];

type Run = (stdin: string, remote: string | undefined) => number;

describe('verify, through run', () => {
  let run: Run;
  let repo: string;
  let saved: Record<string, string | undefined>;
  let out: string;

  const git = (...args: string[]) =>
    realSpawnSync('git', args, { encoding: 'utf8' }).stdout.trim();

  const commit = (message: string) => {
    git('commit', '--quiet', '--allow-empty', '-m', message);
    return git('rev-parse', 'HEAD');
  };

  const refLine = (sha: string) =>
    `refs/heads/topic ${sha} refs/heads/topic ${'0'.repeat(40)}\n`;

  const receiptOf = (sha: string) => {
    const shown = realSpawnSync('git', ['notes', '--ref=gate', 'show', sha], {
      encoding: 'utf8',
    });
    return shown.status === 0 ? JSON.parse(shown.stdout) : null;
  };

  beforeAll(async () => {
    // Importing the hook runs it once over its own stdin. A TTY stdin reads as
    // no ref lines, so that run verifies nothing and leaves exit code 0.
    const tty = process.stdin.isTTY;
    const exitCode = process.exitCode;
    process.stdin.isTTY = true;
    // @ts-expect-error — plain .mjs with JSDoc types, no declaration file.
    ({ run } = await import('../gate/pre-push.mjs'));
    process.stdin.isTTY = tty;
    process.exitCode = exitCode;
  });

  beforeEach(() => {
    saved = Object.fromEntries(SCOPED.map((name) => [name, process.env[name]]));
    repo = mkdtempSync(join(tmpdir(), 'gate-pre-push-'));
    execFileSync('git', ['init', '--quiet', repo]);
    Object.assign(process.env, GIT_ENV, {
      GIT_DIR: join(repo, '.git'),
      GIT_WORK_TREE: repo,
    });
    delete process.env.GIT_INDEX_FILE;
    delete process.env.SANDCASTLE_SANDBOX;
    delete process.env.SC_SKIP_GATE;
    runner.status = 0;
    runner.calls = [];
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
    rmSync(repo, { recursive: true, force: true });
  });

  afterAll(() => {
    vi.doUnmock('node:child_process');
  });

  it('passes a sha whose tree already carries a receipt without running the gate', () => {
    // Arrange
    const head = commit('verified');
    const tree = git('rev-parse', `${head}^{tree}`);
    git('notes', '--ref=gate', 'add', '-m', JSON.stringify({ tree }), head);

    // Act
    const code = run(refLine(head), undefined);

    // Assert
    expect(code).toBe(0);
    expect(out).toContain(`gate: ${head.slice(0, 7)} already verified`);
    expect(runner.calls).toEqual([]);
  });

  it('runs the gate again when the receipt names another tree', () => {
    // Arrange
    const head = commit('stale');
    git(
      'notes',
      '--ref=gate',
      'add',
      '-m',
      JSON.stringify({ tree: 'f'.repeat(40) }),
      head,
    );

    // Act
    const code = run(refLine(head), undefined);

    // Assert
    expect(code).toBe(0);
    expect(out).not.toContain('already verified');
    expect(runner.calls).toHaveLength(1);
  });

  it('refuses an unverified sha in the Sandcastle sandbox without running the gate', () => {
    // Arrange
    const head = commit('sandboxed');
    process.env.SANDCASTLE_SANDBOX = '1';

    // Act
    const code = run(refLine(head), undefined);

    // Assert
    expect(code).toBe(1);
    expect(out).toContain(`gate: ${head.slice(0, 7)} has no receipt`);
    expect(runner.calls).toEqual([]);
    expect(receiptOf(head)).toBeNull();
  });

  it('runs the gate over the working tree for HEAD and writes a fast receipt with its timings', () => {
    // Arrange
    const head = commit('head');

    // Act
    const code = run(refLine(head), undefined);

    // Assert
    expect(code).toBe(0);
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]?.args).toEqual([]);
    expect(runner.calls[0]?.env.GIT_DIR).toBeUndefined();
    expect(receiptOf(head)).toMatchObject({
      tree: git('rev-parse', `${head}^{tree}`),
      tier: 'fast',
      waitedMs: 3,
      ranMs: 7,
    });
  });

  it('runs the gate at a sha that is not checked out', () => {
    // Arrange
    const older = commit('older');
    commit('newer');

    // Act
    const code = run(refLine(older), undefined);

    // Assert
    expect(code).toBe(0);
    expect(runner.calls[0]?.args).toEqual(['--at', older]);
    expect(receiptOf(older)).toMatchObject({ tier: 'fast' });
  });

  it('writes no receipt when the gate fails', () => {
    // Arrange
    const head = commit('red');
    runner.status = 1;

    // Act
    const code = run(refLine(head), undefined);

    // Assert
    expect(code).toBe(1);
    expect(runner.calls).toHaveLength(1);
    expect(receiptOf(head)).toBeNull();
  });

  it('publishes the receipt to the remote it was pushing to', () => {
    // Arrange
    const head = commit('published');
    const remote = mkdtempSync(join(tmpdir(), 'gate-pre-push-remote-'));
    const { GIT_DIR: _dir, GIT_WORK_TREE: _tree, ...unscoped } = process.env;
    execFileSync('git', ['init', '--quiet', '--bare', remote], { env: unscoped });

    try {
      // Act
      const code = run(refLine(head), remote);

      // Assert
      expect(code).toBe(0);
      const published = realSpawnSync('git', ['notes', '--ref=gate', 'show', head], {
        encoding: 'utf8',
        env: { ...unscoped, GIT_DIR: remote },
      });
      expect(JSON.parse(published.stdout)).toMatchObject({ tier: 'fast' });
    } finally {
      rmSync(remote, { recursive: true, force: true });
    }
  });
});
