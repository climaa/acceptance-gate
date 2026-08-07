import { GH_AUTH_SETUP_HOOK, hooksFor } from '../sandcastle-sandbox-hooks.mts';

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
  const commandsFor = (mount: 'head' | 'worktree') =>
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
});
