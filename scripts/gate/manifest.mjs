// @ts-check
//
// The gate, as data.
//
// `.husky/pre-push` runs it before anything reaches the remote. This is the
// repository's gate since 19 Oct 2026: GitHub Actions minutes ran out, the
// per-PR workflows (`pr.yml` among them) are disabled on GitHub rather than
// deleted, and `main`'s ruleset no longer requires a status check. The list is
// portafolio's, which has run its gate this way from the start; the checks are
// the ones `pr.yml` ran, so nothing that was gated before goes ungated.
//
// `checksMatrix` below still builds a CI matrix from this list, for the day the
// workflows are switched back on: one list, so a hook and a workflow cannot
// become two grammars that drift. A slow check added here is paid on every push
// by every person and by every Sandcastle branch.

/**
 * @typedef {object} Check
 * @property {string} name        Stable id. Appears in CI as the job leg name.
 * @property {string} command     Run through the repo's package manager, from `cwd`.
 * @property {'fast' | 'full'} tier
 *   `fast` runs on every push. `full` is opt-in — see the tier note below.
 * @property {string} [cwd]       Repo-relative. Defaults to the repo root.
 * @property {string} [setup]     Run once before `command`, for a check that needs it.
 * @property {'checks' | 'own'} job
 *   Which CI job runs it. `checks` legs share one matrix because their steps are
 *   byte-identical; `own` is for a check needing something of its own — a
 *   Playwright browser, a Docker daemon, a working directory — which a shared
 *   matrix leg cannot express.
 * @property {boolean} [needsDocker]
 * @property {string} why         Why this check exists, for whoever it fails on.
 */

/**
 * Tiers, and why `visual-diff` is not in `fast`.
 *
 * It is the longest check here by a wide margin and it needs Docker up. A
 * pre-push hook that costs five minutes and fails when Docker is down is a
 * hook people pass `--no-verify` to, and a bypassed hook protects nothing. It
 * stays a deliberate `pnpm gate --tier full`, run before a change to
 * `packages/ui` or the baselines is merged.
 *
 * @type {readonly Check[]}
 */
export const CHECKS = [
  {
    name: 'lint',
    job: 'checks',
    command: 'pnpm turbo run lint',
    tier: 'fast',
    why: 'ESLint, per workspace. Warnings are errors here.',
  },
  {
    name: 'typecheck',
    job: 'checks',
    command: 'pnpm turbo run typecheck',
    tier: 'fast',
    why: 'TypeScript strict, per workspace.',
  },
  {
    name: 'build',
    job: 'checks',
    command: 'pnpm turbo run build',
    tier: 'fast',
    why: 'A build failure is the one thing no other check catches.',
  },
  {
    name: 'test',
    job: 'checks',
    command: 'pnpm turbo run test',
    tier: 'fast',
    why: 'Unit and component suites, per workspace.',
  },
  {
    name: 'format',
    job: 'checks',
    command: 'pnpm format:check',
    tier: 'fast',
    why: 'Prettier over the whole repo, docs and .mts included.',
  },
  {
    name: 'health',
    job: 'checks',
    command: 'pnpm health:check',
    tier: 'fast',
    why: 'Cognitive-complexity ceiling of 20 per function, plus .sandcastle/.',
  },
  {
    name: 'boards',
    job: 'checks',
    command: 'pnpm turbo run boards:check',
    tier: 'fast',
    why: 'Every planned story has its tile on its tier board, and every board PNG its scale.',
  },
  {
    name: 'sandcastle',
    job: 'own',
    command: 'pnpm typecheck:sandcastle && pnpm test:sandcastle',
    tier: 'fast',
    why: 'The orchestrator is not a turbo workspace, so turbo never sees it.',
  },
  {
    // Bare `turbo`, with no `dotenv -e .env -o --` in front of it. The root's
    // `dev`/`build`/`test` scripts all load `.env`, and `.env` is gitignored —
    // so a gate that read it would pass or fail on a file no reviewer sees, and
    // would answer differently on every machine. Keeping the gate env-free puts
    // the obligation on the suite: a page object has to match what the screen
    // composes with the variables unset, which is the shape CI runs in anyway.
    name: 'e2e',
    job: 'own',
    command: 'pnpm turbo run e2e',
    setup: 'pnpm --filter @gate/e2e exec playwright install chromium',
    tier: 'fast',
    why: 'The Gherkin acceptance suite — product requirements, not style.',
  },
  {
    name: 'visual-diff',
    job: 'own',
    command: 'node scripts/visual-diff-container.mjs check',
    setup: 'pnpm --filter @gate/storybook build',
    tier: 'full',
    needsDocker: true,
    why: 'Screenshot corpus. Slow and Docker-bound — see the tier note above.',
  },
];

/** @param {'fast' | 'full'} tier @returns {readonly Check[]} */
export function checksFor(tier) {
  return tier === 'full' ? CHECKS : CHECKS.filter((check) => check.tier === 'fast');
}

/**
 * The `checks` matrix, in the shape GitHub Actions wants for `include`.
 *
 * The workflow reads this rather than restating the list in YAML: two copies of
 * the gate is exactly the drift this manifest exists to prevent, and the copy in
 * YAML is the one nobody can run locally to compare.
 *
 * @returns {readonly { name: string, run: string }[]}
 */
export function checksMatrix() {
  return CHECKS.filter((check) => check.job === 'checks').map(({ name, command }) => ({
    name,
    run: command,
  }));
}
