// Orchestrator configuration — constants shared across the plan/implement/
// build-verify/review/merge phases, plus two import-time side effects (not
// just inert constants): the `process.env.PATH` prepend below and the
// TURBO_TOKEN/TURBO_TEAM startup log both run as soon as this module loads.

// `pnpm sandcastle` spawns scripts in /bin/sh with a minimal PATH that omits
// Homebrew's bin dirs, so `gh` (used by the stranded-branch rescue path) goes
// missing. Prepend the common macOS+Linux install locations so host tools
// resolve regardless of launch context.
process.env.PATH = `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ""}`;

// Host-shell only — not from .env (avoids stale-token footgun and accidental git commit).
//
// .env injection caveat: the @ai-hero/sandcastle package's `resolveEnv` parses
// `.sandcastle/.env` and injects every key PRESENT there into every sandbox,
// with per-key fallback to the host `process.env` value only when the .env
// value is EMPTY. A key that is ABSENT from `.sandcastle/.env` gets no
// injection at all — resolveEnv never sweeps the host env wholesale. This
// distinction matters for GH_TOKEN/CLAUDE_CODE_OAUTH_TOKEN too. For turbo,
// the credentials are now threaded via `docker({ env })` at the two build-verify
// call sites (sandbox-provider env, which overrides resolveEnv), so keep
// TURBO_TOKEN/TURBO_TEAM EMPTY or ABSENT in `.sandcastle/.env` to avoid a
// stale-token copy shadowing the host-shell values read below.
// (`.sandcastle/.env` is gitignored — this can only be documented, not enforced.)
export const turboToken = process.env.TURBO_TOKEN ?? "";
export const turboTeam = process.env.TURBO_TEAM ?? "";
if (turboToken && turboTeam) {
  console.log(
    `[turbo] remote cache enabled (TURBO_TOKEN=${turboToken.length} chars, TURBO_TEAM=${turboTeam.length} chars)`,
  );
} else {
  console.log(
    "[turbo] remote cache disabled — TURBO_TOKEN/TURBO_TEAM not set in host env (run `turbo login && turbo link` to enable)",
  );
}

// Base branch the orchestrator merges into. Used to detect whether a
// sandcastle/* branch has work ready to merge, regardless of which run
// produced the commits.
export const BASE_BRANCH = "main";

// Maximum number of plan→execute→merge cycles before stopping.
// Raise this if your backlog is large; lower it for a quick smoke-test run.
export const MAX_ITERATIONS = 10;

// Hooks run inside the sandbox before the agent starts each iteration.
// npm install ensures the sandbox always has fresh dependencies.
//
// Git credential helper (issue #1433): GH_TOKEN in the sandbox env is enough
// for `gh` CLI commands, but plain `git push` won't authenticate from it
// without a credential helper wired up. This bites the merger phase, whose
// fallback push runs `git push` directly. `gh auth setup-git` configures the
// helper (`credential.https://github.com.helper '!gh auth git-credential'`),
// but it must run here at runtime — GH_TOKEN isn't available at docker build
// time, so it can't live as a Dockerfile RUN. Gated on GH_TOKEN so it's a
// no-op (not an error) in environments where the token isn't set.
//
// CI=true: the sandbox exec has no TTY, so a node_modules state that pnpm
// wants to purge-and-reinstall (e.g. a differing store/HOME between host and
// container) hits pnpm's interactive "confirm removal" prompt and aborts
// non-interactively with ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY. CI=true
// auto-confirms, matching how the host pre-push hook already runs installs.
export const hooks = {
  sandbox: {
    onSandboxReady: [
      {
        command: 'if [ -n "$GH_TOKEN" ]; then gh auth setup-git; fi',
        timeoutMs: 60_000,
      },
      { command: "CI=true pnpm install", timeoutMs: 600_000 },
    ],
  },
};
