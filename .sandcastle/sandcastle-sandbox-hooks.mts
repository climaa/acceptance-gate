// Sandbox startup hooks, split by WHAT THE SANDBOX BIND-MOUNTS.
//
// Deliberately imports NOTHING from this directory — a layering choice, not a
// necessity. `sandcastle-config.mts` is import-safe now (its `gh` preflight and
// turbo-cache log are explicit calls, not import-time side effects); it once
// threw on import, which is why this pure L0 layer exists. Same reasoning as
// sandcastle-model-overrides.mts and sandcastle-worktree-safety.mts.
//
// Why the split exists at all. There used to be one `hooks` const passed to
// every sandbox, and it ran `CI=true pnpm install` on all of them. Two of the
// four sandboxes are HEAD-mode:
//
//   sandcastle.run({ sandbox: docker(...) })      -> planner, merger
//   sandcastle.createSandbox({ branch, ... })     -> implementer/reviewer, rescue
//
// The SDK defaults a bind-mount provider with no branchStrategy to
// `{ type: "head" }`, and head mode mounts `hostRepoDir` — the developer's own
// checkout — at /home/agent/workspace. So that hook ran a full install against
// the HOST's node_modules from inside the container, which rewrote
// node_modules/.modules.yaml with the CONTAINER's store path:
//
//   "storeDir": "/home/agent/workspace/.pnpm-store/v11"   # host: ~/Library/pnpm/store/v11
//
// The host's pnpm then sees a foreign store, decides node_modules must be
// purged and reinstalled, and — with no TTY to confirm at — aborts with
// ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY. That killed the NEXT
// `pnpm sandcastle` at startup, before any phase ran, and equally any
// lint/build/test invoked from a script or CI-like shell.
//
// plan-prompt.md and merge-prompt.md already forbid the AGENT from running a
// bare `pnpm install` in these sandboxes for exactly this reason. The
// orchestrator was running one on its behalf before the agent started, which
// is why the prompt rule never helped. Head-mode sandboxes need no install:
// `pnpm sandcastle` resolves `tsx` from the host's node_modules, so the host
// is provably installed before a head-mode container can exist.
//
// Worktree-mode sandboxes still install, and must: their mount is a fresh
// `git worktree` under .sandcastle/worktrees/ with no node_modules at all.

/** One `onSandboxReady` entry, in the shape @ai-hero/sandcastle expects. */
export type SandboxHook = { command: string; timeoutMs: number };

/** The `hooks` option accepted by sandcastle.run() / createSandbox(). */
export type SandboxHooks = { sandbox: { onSandboxReady: SandboxHook[] } };

/**
 * What the sandbox has mounted at /home/agent/workspace:
 *  - `"head"`     — the host checkout itself. Treat as read-only infrastructure.
 *  - `"worktree"` — a throwaway git worktree. Safe to install into.
 */
export type SandboxMount = 'head' | 'worktree';

// GH_TOKEN in the sandbox env is enough for `gh` CLI commands, but plain
// `git push` won't authenticate from it without a credential helper wired up.
// This bites the merger phase, whose fallback push runs `git push` directly.
// It must run here at runtime rather than as a Dockerfile RUN — GH_TOKEN isn't
// available at docker build time. Gated on GH_TOKEN so it's a no-op (not an
// error) in environments where the token isn't set.
export const GH_AUTH_SETUP_HOOK: SandboxHook = {
  command: 'if [ -n "$GH_TOKEN" ]; then gh auth setup-git; fi',
  timeoutMs: 60_000,
};

// CI=true: the sandbox exec has no TTY, so a node_modules state that pnpm
// wants to purge-and-reinstall hits pnpm's interactive "confirm removal"
// prompt and aborts with ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY. CI=true
// auto-confirms. Note this is the SAME failure the host now hits when a
// container stamps its store path into the host's node_modules — CI=true is
// the right answer inside a disposable worktree and the wrong one for a
// developer's checkout, which is why head-mode simply does not install.
export const PNPM_INSTALL_HOOK: SandboxHook = {
  command: 'CI=true pnpm install',
  timeoutMs: 600_000,
};

/**
 * Hooks for a sandbox mounting `mount`. Returns a fresh object each call so a
 * caller cannot mutate the hooks another sandbox will run.
 *
 * Throws on an unrecognised mount: defaulting would pick one of the two
 * variants silently, and the permissive one writes to the host checkout.
 */
export function hooksFor(mount: SandboxMount): SandboxHooks {
  switch (mount) {
    case 'head':
      return { sandbox: { onSandboxReady: [{ ...GH_AUTH_SETUP_HOOK }] } };
    case 'worktree':
      return {
        sandbox: {
          onSandboxReady: [{ ...GH_AUTH_SETUP_HOOK }, { ...PNPM_INSTALL_HOOK }],
        },
      };
    default:
      throw new Error(
        `Unknown sandbox mount ${JSON.stringify(mount)} — expected "head" or ` +
          `"worktree". Refusing to guess: the "worktree" variant runs ` +
          `\`pnpm install\`, which against a head-mounted host checkout ` +
          `rewrites the developer's node_modules.`,
      );
  }
}

/** Planner and merger: the host checkout is mounted — never install. */
export const headHooks: SandboxHooks = hooksFor('head');

/** Implementer/reviewer and the rescue build-verify: fresh worktree, install. */
export const worktreeHooks: SandboxHooks = hooksFor('worktree');
