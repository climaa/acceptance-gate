import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  TURBO_CONCURRENCY_HOOK,
  type SandboxMount,
  hooksFor,
} from '../sandcastle-sandbox-hooks.mts';

// A build OOM-killed (exit 137) at turbo's default concurrency of 10 inside
// the container's memory sent an implementer to diagnose an "environmental
// failure" on every run. The hook bounds turbo from the container's own CPU
// and memory. Runs the hook's real command in sh with a stub `nproc` and a
// throwaway HOME, then reads back what it left in ~/.bashrc.
describe('sandcastle turbo concurrency hook', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'turbo-concurrency-hook-'));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  const stubNproc = (cpus: number) => {
    const nproc = join(home, 'nproc');
    writeFileSync(nproc, `#!/bin/sh\necho ${cpus}\n`);
    chmodSync(nproc, 0o755);
  };

  const runHook = () =>
    execFileSync('sh', ['-c', TURBO_CONCURRENCY_HOOK.command], {
      env: { PATH: `${home}:${process.env.PATH ?? ''}`, HOME: home },
    });

  const exported = () => {
    const match = readFileSync(join(home, '.bashrc'), 'utf8').match(
      /^export TURBO_CONCURRENCY=(\d+)$/m,
    );
    return match ? Number(match[1]) : null;
  };

  it('sets a concurrency of at least 1 and below the CPU count', () => {
    // Arrange
    const cpus = 8;
    stubNproc(cpus);

    // Act
    runHook();

    // Assert
    const value = exported();
    expect(value).not.toBeNull();
    expect(value).toBeGreaterThanOrEqual(1);
    expect(value).toBeLessThan(cpus);
  });

  it('never goes below 1, even on a two-core container', () => {
    // Arrange
    stubNproc(2);

    // Act
    runHook();

    // Assert
    expect(exported()).toBe(1);
  });

  it('puts the export above an interactive-only guard, so a non-interactive shell still reads it', () => {
    // Arrange: Debian's stock ~/.bashrc returns early unless the shell is interactive.
    stubNproc(8);
    writeFileSync(join(home, '.bashrc'), 'case $- in *i*) ;; *) return;; esac\n');

    // Act
    runHook();
    const seen = execFileSync('bash', ['-c', '. ~/.bashrc; echo "$TURBO_CONCURRENCY"'], {
      env: { PATH: process.env.PATH ?? '', HOME: home },
    })
      .toString()
      .trim();

    // Assert
    expect(Number(seen)).toBe(exported());
  });

  it('writes one export however many times it runs', () => {
    // Arrange
    stubNproc(8);

    // Act
    runHook();
    runHook();

    // Assert
    const lines = readFileSync(join(home, '.bashrc'), 'utf8').match(
      /TURBO_CONCURRENCY=/g,
    );
    expect(lines).toHaveLength(1);
  });

  it.each<SandboxMount>(['head', 'worktree'])(
    'runs in the %s sandbox, which can run the gate',
    (mount) => {
      // Arrange & Act
      const commands = hooksFor(mount).sandbox.onSandboxReady.map((h) => h.command);

      // Assert
      expect(commands).toContain(TURBO_CONCURRENCY_HOOK.command);
    },
  );
});
