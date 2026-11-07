import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  GH_AUTH_SETUP_HOOK,
  type SandboxMount,
  hooksFor,
} from '../sandcastle-sandbox-hooks.mts';

// the merger phase's isolated sandbox can fail `git push` with
// "no git credentials available in this environment" — GH_TOKEN alone lets the
// `gh` CLI authenticate, but plain `git push` needs a credential helper wired
// up. The fix adds a credential-helper setup step to the sandbox startup hook
// (onSandboxReady) so it runs with GH_TOKEN present at runtime (unavailable at
// docker build time, so it can't be a Dockerfile RUN).
//
// These were source-text assertions over sandcastle-config.mts until the hooks
// moved to sandcastle-sandbox-hooks.mts, which imports nothing local and can
// therefore be loaded for real. Same assertions, now against the values the
// orchestrator actually passes to the SDK.
describe('sandcastle git credential helper', () => {
  const commandsFor = (mount: SandboxMount) =>
    hooksFor(mount).sandbox.onSandboxReady.map((h) => h.command);

  it('wires a git credential helper in onSandboxReady (gh auth setup-git or git config credential.helper)', () => {
    expect(GH_AUTH_SETUP_HOOK.command).toMatch(
      /gh auth setup-git|credential\.helper|git-credential/,
    );
  });

  it('gates the credential-helper setup on GH_TOKEN being present', () => {
    // The token isn't guaranteed in every environment; the setup must be a
    // no-op when GH_TOKEN is absent rather than erroring the whole run.
    expect(GH_AUTH_SETUP_HOOK.command).toMatch(/GH_TOKEN/);
  });

  it('runs the credential helper in the merger’s head-mode sandbox, which is what pushes', () => {
    expect(commandsFor('head')).toContain(GH_AUTH_SETUP_HOOK.command);
  });

  it('keeps the existing CI=true pnpm install hook for worktree-mounted sandboxes', () => {
    // Head-mounted sandboxes deliberately no longer install — see
    // sandcastle.head-mode-install.test.ts.
    expect(commandsFor('worktree')).toContain('CI=true pnpm install');
  });

  // Every checkout's origin is git@github.com:…, so the credential helper
  // alone left pushes and fetches on SSH, where the container has no user
  // (`No user exists for uid 501`). Runs the hook's real command in a shell
  // with a stub `gh` and a throwaway HOME, so --global lands in a temp file.
  describe('running the hook', () => {
    let home: string;

    beforeEach(() => {
      home = mkdtempSync(join(tmpdir(), 'gh-auth-hook-'));
      const gh = join(home, 'gh');
      writeFileSync(gh, `#!/bin/sh\necho "$@" > "${home}/gh-called"\n`);
      chmodSync(gh, 0o755);
    });

    afterEach(() => {
      rmSync(home, { recursive: true, force: true });
    });

    // Built from scratch rather than spread from process.env, so an outer
    // GIT_CONFIG_GLOBAL can't point the hook and the read at different files.
    const isolatedEnv = () => ({
      PATH: `${home}:${process.env.PATH ?? ''}`,
      HOME: home,
      XDG_CONFIG_HOME: join(home, '.config'),
      GIT_CONFIG_NOSYSTEM: '1',
    });

    const runHook = (token: string) =>
      execFileSync('sh', ['-c', GH_AUTH_SETUP_HOOK.command], {
        env: { ...isolatedEnv(), GH_TOKEN: token },
      });

    const globalConfig = (key: string) => {
      try {
        return execFileSync('git', ['config', '--global', '--get-all', key], {
          env: isolatedEnv(),
        })
          .toString()
          .trim();
      } catch {
        return '';
      }
    };

    it('wires the credential helper and rewrites SSH GitHub remotes to HTTPS when GH_TOKEN is set', () => {
      // Arrange
      const token = 'ghp_test';

      // Act
      runHook(token);

      // Assert
      expect(existsSync(join(home, 'gh-called'))).toBe(true);
      expect(globalConfig('url.https://github.com/.insteadOf')).toBe('git@github.com:');
    });

    it('does nothing when GH_TOKEN is absent', () => {
      // Arrange
      const token = '';

      // Act
      runHook(token);

      // Assert
      expect(existsSync(join(home, 'gh-called'))).toBe(false);
      expect(existsSync(join(home, '.gitconfig'))).toBe(false);
    });
  });
});
