// Orchestrator tunables — the values you would reach for to change how a run
// behaves, in one place rather than buried beside the logic that consumes them.
//
// Distinct from sandcastle-config.mts, which is wiring: it resolves turbo
// credentials off disk, runs the gh preflight, and derives the repo root. This
// file is inert by design — plain values, no imports, no IO, nothing that runs
// on load. Anything needing a filesystem read or a preflight belongs there,
// not here.
//
// `.mts`, not `.ts`: .sandcastle/tsconfig.json includes ["*.mts",
// "__tests__/**/*.ts"], so a root-level .ts file in this directory is silently
// excluded from `pnpm typecheck:sandcastle` — it would look checked and not be.

// `TURBO_CACHE_DIR=/tmp/turbo-cache` keeps turbo's filesystem cache out of the
// bind-mounted repo root. The repo-root `.turbo/` can be root-owned from prior
// container runs while the sandbox runs as a mapped uid, so turbo's default
// `<repo>/.turbo/cache` location fails with "Permission denied (os error 13)"
// and kills the build in seconds (build-gate hardening). turbo 2.9 honors this env var.
export const BUILD_VERIFY_COMMAND = 'TURBO_CACHE_DIR=/tmp/turbo-cache pnpm build';

// Each in-sandbox git setup command (safe.directory, user.name/email, branch
// discovery) gets this long before @ai-hero/sandcastle gives up. Its default
// is 10s. On 5 Oct 2026 a reviewer's sandbox died at setup on
// `git rev-parse --abbrev-ref HEAD` timing out after 10000ms. The host was
// busy with the implementer's push gate, the implementer's work was already
// pushed, and the branch merged with no review through the stranded-branch
// rescue. A command that normally takes milliseconds needs headroom for a
// loaded host, not a tighter bound.
export const SANDBOX_GIT_SETUP_TIMEOUT_MS = 60_000;

// Sandbox.exec() has no built-in timeout (unlike sandbox.run()'s
// idleTimeoutSeconds), so this mirrors the old build-verify agent's 600s guard.
export const BUILD_VERIFY_TIMEOUT_MS = 600_000;
