import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// @ts-expect-error — plain .mjs with JSDoc types, no declaration file.
import { CHECKS } from '../gate/manifest.mjs';
// @ts-expect-error — plain .mjs with JSDoc types, no declaration file.
import { planFor, SANDBOX_SKIP_LINE } from '../gate/sandbox.mjs';

/**
 * Inside the Sandcastle sandbox the image has no browser, so e2e can never pass
 * there. The gate skips it with one line saying why, and writes no receipt: a
 * later push must never read "already verified" for a tree whose e2e never ran.
 * On the host nothing changes.
 *
 * The runner and the hook body run for real, copied into a throwaway repository
 * beside a stub manifest whose checks only print their name, so the test reads
 * which checks ran and which receipts were left.
 */
const GATE_DIR = resolve(__dirname, '../gate');

const STUB_MANIFEST = `
export const CHECKS = [
  { name: 'lint', job: 'checks', command: 'echo ran-lint', tier: 'fast', why: 'stub' },
  { name: 'e2e', job: 'own', command: 'echo ran-e2e', tier: 'fast', why: 'stub' },
];
export const checksFor = () => CHECKS;
`;

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: 'Gate Test',
  GIT_AUTHOR_EMAIL: 'gate@test.invalid',
  GIT_COMMITTER_NAME: 'Gate Test',
  GIT_COMMITTER_EMAIL: 'gate@test.invalid',
};

describe('the gate inside the Sandcastle sandbox', () => {
  let repo: string;

  /** process.env without the sandbox mark or any git a hook may have exported. */
  const baseEnv = () => {
    // Its own gate lock: this suite runs inside a gate that holds the real one.
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...GIT_IDENTITY,
      GATE_LOCK: `${repo}.gate.lock`,
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

  const receipts = () => git('notes', '--ref=gate', 'list');

  const gate = (env: NodeJS.ProcessEnv) =>
    spawnSync('node', [join(repo, 'scripts/gate/run.mjs')], {
      cwd: repo,
      encoding: 'utf8',
      env,
    });

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'gate-sandbox-'));
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
    rmSync(repo, { recursive: true, force: true });
    rmSync(`${repo}.gate.lock`, { force: true });
  });

  it('skips e2e and writes no receipt in the sandbox', () => {
    // Arrange
    const env = { ...baseEnv(), SANDCASTLE_SANDBOX: '1' };

    // Act
    const result = gate(env);

    // Assert
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ran-lint');
    expect(result.stdout).not.toContain('ran-e2e');
    expect(result.stdout).not.toContain('receipt written');
    expect(receipts()).toBe('');
  });

  it('prints one skip line that says e2e runs on the host push', () => {
    // Arrange
    const env = { ...baseEnv(), SANDCASTLE_SANDBOX: '1' };

    // Act
    const result = gate(env);

    // Assert
    const skipLines = result.stdout
      .split('\n')
      .filter((line) => line.includes('e2e skipped'));
    expect(skipLines).toEqual([SANDBOX_SKIP_LINE]);
    expect(SANDBOX_SKIP_LINE).toMatch(/no browser/);
    expect(SANDBOX_SKIP_LINE).toMatch(/host push/);
  });

  it('runs e2e and writes the receipt on the host', () => {
    // Arrange
    const env = baseEnv();

    // Act
    const result = gate(env);

    // Assert
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ran-lint');
    expect(result.stdout).toContain('ran-e2e');
    expect(result.stdout).not.toContain('e2e skipped');
    expect(receipts()).not.toBe('');
  });

  it('refuses an unverified push from the sandbox and leaves no receipt', () => {
    // Arrange
    const env = { ...baseEnv(), SANDCASTLE_SANDBOX: '1' };
    const head = git('rev-parse', 'HEAD');
    const refLine = `refs/heads/main ${head} refs/heads/main ${'0'.repeat(40)}\n`;

    // Act
    const result = spawnSync('node', [join(repo, 'scripts/gate/pre-push.mjs')], {
      cwd: repo,
      encoding: 'utf8',
      env,
      input: refLine,
    });

    // Assert
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain('ran-lint');
    expect(receipts()).toBe('');
  });
});

describe('planFor', () => {
  it('keeps every real check but e2e in the sandbox, and no receipt', () => {
    // Arrange
    const env = { SANDCASTLE_SANDBOX: '1' };

    // Act
    const plan = planFor(CHECKS, env);

    // Assert
    const names = plan.checks.map((check: { name: string }) => check.name);
    expect(names).toEqual(
      CHECKS.map((check: { name: string }) => check.name).filter(
        (name: string) => name !== 'e2e',
      ),
    );
    expect(plan.receipt).toBe(false);
  });

  it('changes nothing on the host', () => {
    // Arrange
    const env = {};

    // Act
    const plan = planFor(CHECKS, env);

    // Assert
    expect(plan).toEqual({ checks: CHECKS, receipt: true });
  });
});
