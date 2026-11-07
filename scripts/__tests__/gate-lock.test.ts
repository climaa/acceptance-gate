import { type ChildProcess, execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * One gate per machine, across checkouts. The runner takes a lock outside every
 * checkout before its first check; a second gate waits, saying once whose turn
 * it is, or refuses at once under `--no-wait`. A lock whose pid is gone is taken
 * over, and the lock is released on every way out, a failing check and SIGINT
 * included.
 *
 * The real runner runs, copied into a throwaway repository beside a stub
 * manifest whose one check is `STUB_COMMAND` (by default it prints `ran-lint`),
 * with `GATE_LOCK` pointing at a file of the test's own.
 */
const GATE_DIR = resolve(__dirname, '../gate');

const STUB_MANIFEST = `
export const CHECKS = [
  { name: 'lint', job: 'checks', command: process.env.STUB_COMMAND ?? 'echo ran-lint', tier: 'fast', why: 'stub' },
];
export const checksFor = () => CHECKS;
`;

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: 'Gate Test',
  GIT_AUTHOR_EMAIL: 'gate@test.invalid',
  GIT_COMMITTER_NAME: 'Gate Test',
  GIT_COMMITTER_EMAIL: 'gate@test.invalid',
};

const OTHER_CHECKOUT = '/somewhere/else/torn';

describe('the machine-wide gate lock', () => {
  let repo: string;
  let lock: string;
  const children: ChildProcess[] = [];

  const baseEnv = (extra: NodeJS.ProcessEnv = {}) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...GIT_IDENTITY,
      GATE_LOCK: lock,
      ...extra,
    };
    for (const name of Object.keys(env)) {
      if (
        name === 'SANDCASTLE_SANDBOX' ||
        /^GIT_(DIR|WORK_TREE|INDEX_FILE)$/.test(name)
      ) {
        delete env[name];
      }
    }
    return env;
  };

  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8', env: baseEnv() }).trim();

  const gateSync = (args: string[] = [], extra: NodeJS.ProcessEnv = {}) =>
    spawnSync('node', [join(repo, 'scripts/gate/run.mjs'), ...args], {
      cwd: repo,
      encoding: 'utf8',
      env: baseEnv(extra),
    });

  /** The gate, running, with its stdout collected as it comes. */
  const gateAsync = (extra: NodeJS.ProcessEnv = {}) => {
    const child = spawn('node', [join(repo, 'scripts/gate/run.mjs')], {
      cwd: repo,
      env: baseEnv(extra),
      detached: true,
    });
    children.push(child);
    const output = { text: '' };
    child.stdout?.on('data', (chunk) => (output.text += String(chunk)));
    const exited = new Promise<{ code: number | null }>((done) =>
      child.on('exit', (code) => done({ code })),
    );
    return { child, output, exited };
  };

  const until = async (condition: () => boolean, timeoutMs = 15_000) => {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
      if (Date.now() > deadline) throw new Error('timed out waiting');
      await new Promise((tick) => setTimeout(tick, 50));
    }
  };

  const holdLock = (pid: number, startedAt = new Date(Date.now() - 125_000)) =>
    writeFileSync(
      lock,
      JSON.stringify({
        pid,
        checkout: OTHER_CHECKOUT,
        tier: 'fast',
        startedAt: startedAt.toISOString(),
      }),
    );

  /** A pid that existed and is gone. */
  const deadPid = () => spawnSync('node', ['-e', '0']).pid;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'gate-lock-'));
    lock = `${repo}.gate.lock`;
    const gateDir = join(repo, 'scripts/gate');
    mkdirSync(gateDir, { recursive: true });
    for (const file of readdirSync(GATE_DIR).filter((f) => f.endsWith('.mjs'))) {
      copyFileSync(join(GATE_DIR, file), join(gateDir, file));
    }
    writeFileSync(join(gateDir, 'manifest.mjs'), STUB_MANIFEST);
    writeFileSync(join(repo, '.nvmrc'), `${process.version}\n`);
    git('init', '--quiet');
    git('add', '.');
    git('commit', '--quiet', '-m', 'fixture');
  });

  afterEach(() => {
    for (const child of children.splice(0)) {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          process.kill(-(child.pid as number), 'SIGKILL');
        } catch {
          // Already gone.
        }
      }
    }
    rmSync(repo, { recursive: true, force: true });
    rmSync(lock, { force: true });
  });

  it('waits while another gate holds the lock, then runs once it is released', async () => {
    // Arrange
    holdLock(process.pid);
    const gate = gateAsync();
    await until(() => gate.output.text.includes('waits its turn'));
    const ranBeforeRelease = gate.output.text.includes('ran-lint');

    // Act
    unlinkSync(lock);
    const { code } = await gate.exited;

    // Assert
    expect(ranBeforeRelease).toBe(false);
    expect(code).toBe(0);
    expect(gate.output.text).toContain('ran-lint');
    const waitLines = gate.output.text
      .split('\n')
      .filter((line) => line.includes('waits its turn'));
    expect(waitLines).toHaveLength(1);
    expect(waitLines[0]).toMatch(
      `gate: the fast gate in ${OTHER_CHECKOUT} (pid ${process.pid}) ` +
        `has held this machine for 2m0`,
    );
    expect(existsSync(lock)).toBe(false);
  });

  it('records in the receipt how long it waited, apart from how long it ran', async () => {
    // Arrange
    holdLock(process.pid);
    const gate = gateAsync();
    await until(() => gate.output.text.includes('waits its turn'));

    // Act
    unlinkSync(lock);
    await gate.exited;

    // Assert
    const [, annotated] = git('notes', '--ref=gate', 'list').split(/\s+/);
    const receipt = JSON.parse(git('notes', '--ref=gate', 'show', annotated as string));
    expect(receipt.waitedMs).toBeGreaterThan(0);
    expect(receipt.ranMs).toBeGreaterThanOrEqual(0);
    expect(gate.output.text).toMatch(/waited \d+s for the machine's gate lock, ran \d+s/);
  });

  it('keeps the wait apart from the run in the receipt the pre-push hook writes', () => {
    // Arrange
    const head = git('rev-parse', 'HEAD');
    const refLine = `refs/heads/main ${head} refs/heads/main ${'0'.repeat(40)}\n`;

    // Act
    const result = spawnSync('node', [join(repo, 'scripts/gate/pre-push.mjs')], {
      cwd: repo,
      encoding: 'utf8',
      env: baseEnv(),
      input: refLine,
    });

    // Assert
    expect(result.status).toBe(0);
    const receipt = JSON.parse(git('notes', '--ref=gate', 'show', head));
    expect(receipt).toMatchObject({ tier: 'fast', waitedMs: expect.any(Number) });
    expect(receipt.ranMs).toEqual(expect.any(Number));
  });

  it('takes over a stale lock whose pid is gone, and says so', () => {
    // Arrange
    const pid = deadPid();
    holdLock(pid);

    // Act
    const result = gateSync();

    // Assert
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      `gate: took over a stale lock — the fast gate in ${OTHER_CHECKOUT} (pid ${pid}) is gone`,
    );
    expect(result.stdout).toContain('ran-lint');
    expect(existsSync(lock)).toBe(false);
  });

  it('refuses at once under --no-wait, with the same sentence', () => {
    // Arrange
    holdLock(process.pid);
    const held = readFileSync(lock, 'utf8');

    // Act
    const result = gateSync(['--no-wait']);

    // Assert
    expect(result.status).toBe(2);
    expect(result.stdout).toContain(
      `gate: the fast gate in ${OTHER_CHECKOUT} (pid ${process.pid}) has held this machine for 2m0`,
    );
    expect(result.stdout).not.toContain('ran-lint');
    expect(readFileSync(lock, 'utf8')).toBe(held);
  });

  it('records its pid, checkout, tier and start time while it runs', async () => {
    // Arrange
    const gate = gateAsync({ STUB_COMMAND: 'sleep 30' });

    // Act
    await until(() => gate.output.text.includes('→ lint'));
    const holder = JSON.parse(readFileSync(lock, 'utf8'));

    // Assert
    expect(holder).toMatchObject({ pid: gate.child.pid, checkout: repo, tier: 'fast' });
    expect(Date.parse(holder.startedAt)).not.toBeNaN();
  });

  it('releases the lock after a failing check', () => {
    // Arrange
    const env = { STUB_COMMAND: 'exit 1' };

    // Act
    const result = gateSync([], env);

    // Assert
    expect(result.status).toBe(1);
    expect(existsSync(lock)).toBe(false);
  });

  it('releases the lock after SIGINT and stops at the interrupted check', async () => {
    // Arrange
    const gate = gateAsync({ STUB_COMMAND: 'sleep 30' });
    await until(() => gate.output.text.includes('→ lint') && existsSync(lock));

    // Act
    process.kill(-(gate.child.pid as number), 'SIGINT');
    const { code } = await gate.exited;

    // Assert
    expect(code).toBe(130);
    expect(existsSync(lock)).toBe(false);
  });

  it('leaves a lock another gate holds when it exits', () => {
    // Arrange
    holdLock(process.pid);

    // Act
    gateSync(['--no-wait']);

    // Assert
    expect(JSON.parse(readFileSync(lock, 'utf8')).pid).toBe(process.pid);
  });
});
