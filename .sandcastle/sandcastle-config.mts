// Orchestrator configuration — constants shared across the plan/implement/
// build-verify/review/merge phases.
//
// Importing this module is side-effect-free apart from two best-effort file
// reads that cannot throw or print. The `gh` preflight and the turbo
// remote-cache log used to run at import; both are now explicit functions the
// composition root calls (assertGhAvailable, logTurboCacheStatus).
//
// Why that mattered: a module that throws on import cannot be loaded by a unit
// test, so every module importing this one was untestable, and two modules
// (sandcastle-model-overrides.mts, sandcastle-worktree-safety.mts) are written
// to import nothing at all specifically to stay clear of it. The trade-off is
// that an explicit call can be forgotten where an import could not — which is
// why sandcastle.turbo-env.test.ts asserts main.mts still makes both calls.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeTurboCache, resolveTurboCache } from './sandcastle-turbo-cache.mts';

// Preflight: refuse to start without `gh` on PATH.
//
// This replaced a blind `process.env.PATH` prepend of Homebrew's bin dirs. The
// prepend was redundant in every launch path that actually exists (an
// interactive shell already exports them) and it hid the real hazard, which is
// that every host-side `gh` call swallows its own failure: `fetchIssue`
// returns null and `branchHasOpenPr` returns false. A missing binary would
// therefore not error — it would silently drop the `sc:*` model-override
// labels, running every issue on the expensive default, and report that
// branches have no open PR. Failing loudly here is worth more than guessing at
// install locations.
export function assertGhAvailable(): void {
  try {
    execSync('command -v gh', { stdio: 'ignore' });
  } catch {
    throw new Error(
      '`gh` was not found on PATH. The orchestrator reads issue state and the ' +
        '`sc:*` model-override labels through it, and those call sites fail ' +
        'silently (null / false) rather than erroring — so a run would quietly ' +
        'use the wrong models. Refusing to start. Install the GitHub CLI, or ' +
        'launch from a shell whose PATH includes it.',
    );
  }
}

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readIfPresent(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

// Turbo credentials come from the repo-root `.env` and NOWHERE else — never
// `process.env`. The decision itself lives in sandcastle-turbo-cache.mts as a
// pure function; this is only the wiring that hands it the two files. See that
// module for why ambient env is excluded and why it fails closed.
//
// Two operational caveats that belong here, next to the reads:
//
//  - The `turbo` binary cannot read `.env` itself ("Turborepo does not
//    natively load .env files into a task's runtime"), so package.json wraps
//    the turbo scripts in `dotenv -e .env -o --`. This module needs no such
//    wrapper — do not "simplify" it back onto process.env.
//  - `turbo` REWRITES `.turbo/config.json` from whatever TURBO_TEAM it sees, so
//    a bare `turbo run ...` with a foreign team exported would re-point the
//    reference this guard checks against. Invoke turbo through the pnpm
//    scripts, not directly.
//
// .env injection caveat: the @ai-hero/sandcastle package's `resolveEnv` parses
// `.sandcastle/.env` and injects every key PRESENT there into every sandbox.
// Keep TURBO_TOKEN/TURBO_TEAM ABSENT from `.sandcastle/.env` so a stale copy
// cannot shadow the values threaded via `docker({ env })` at the two
// build-verify call sites. (`.sandcastle/.env` is gitignored — documentable,
// not enforceable.)
const turboCache = resolveTurboCache(
  readIfPresent(path.join(REPO_ROOT, '.env')),
  readIfPresent(path.join(REPO_ROOT, '.turbo', 'config.json')),
);
export function logTurboCacheStatus(): void {
  console.log(describeTurboCache(turboCache));
}

export const turboToken = turboCache.enabled ? turboCache.token : '';
export const turboTeam = turboCache.enabled ? turboCache.team : '';

// Base branch the orchestrator merges into. Used to detect whether a
// sandcastle/* branch has work ready to merge, regardless of which run
// produced the commits.
export const BASE_BRANCH = 'main';

// Maximum number of plan→execute→merge cycles before stopping.
// Raise this if your backlog is large; lower it for a quick smoke-test run.
export const MAX_ITERATIONS = 10;

// Sandbox startup hooks live in sandcastle-sandbox-hooks.mts, split into
// `headHooks` and `worktreeHooks` and imported at each sandbox call site so the
// choice of mount is visible next to the sandbox it configures. A single
// undifferentiated `hooks` const here is what previously ran
// `CI=true pnpm install` against the head-mounted HOST checkout.
