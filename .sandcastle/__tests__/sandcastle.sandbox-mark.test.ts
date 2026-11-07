import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  SANDBOX_MARK_HOOK,
  type SandboxMount,
  hooksFor,
} from '../sandcastle-sandbox-hooks.mts';

// `pnpm gate` skips e2e and writes no receipt when SANDCASTLE_SANDBOX=1
// (scripts/gate/sandbox.mjs). The hook is what sets it in the agent's shell.
// Runs the hook's real command in sh with a throwaway HOME.
describe('sandcastle sandbox mark hook', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'sandbox-mark-hook-'));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  const runHook = () =>
    execFileSync('sh', ['-c', SANDBOX_MARK_HOOK.command], {
      env: { PATH: process.env.PATH ?? '', HOME: home },
    });

  it('exports SANDCASTLE_SANDBOX=1 to a non-interactive shell, above the interactive guard', () => {
    // Arrange
    writeFileSync(join(home, '.bashrc'), 'case $- in *i*) ;; *) return;; esac\n');

    // Act
    runHook();
    const seen = execFileSync('bash', ['-c', '. ~/.bashrc; echo "$SANDCASTLE_SANDBOX"'], {
      env: { PATH: process.env.PATH ?? '', HOME: home },
      encoding: 'utf8',
    });

    // Assert
    expect(seen.trim()).toBe('1');
  });

  it('is idempotent', () => {
    // Arrange
    runHook();

    // Act
    runHook();

    // Assert
    const lines = readFileSync(join(home, '.bashrc'), 'utf8').match(
      /SANDCASTLE_SANDBOX=/g,
    );
    expect(lines).toHaveLength(1);
  });

  it.each<SandboxMount>(['head', 'worktree'])('runs in the %s sandbox', (mount) => {
    // Arrange & Act
    const commands = hooksFor(mount).sandbox.onSandboxReady.map((h) => h.command);

    // Assert
    expect(commands).toContain(SANDBOX_MARK_HOOK.command);
  });
});
