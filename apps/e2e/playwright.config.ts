import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

import { VD_HOSTS, type VdWorld, vdWorldDir } from './pages/visual-diff-hosts';

// Generate Playwright specs from Gherkin .feature files + step definitions.
// The returned path is where `bddgen` writes the generated specs.
//
// Both globs name the lane, never the layer root. `features/**` would now also
// match `features/local/`, whose scenarios assert against the dev server on 3300
// and YOUR `.visual-diff` tree — compiling those into the merge-gating suite
// would aim a required check at data no PR produced. `steps/**` is narrowed for
// the same reason from the other side: two lanes now export a `test`, and this
// glob is what decides which one the generated specs bind to.
const testDir = defineBddConfig({
  features: 'features/acceptance/**/*.feature',
  steps: 'steps/acceptance/**/*.ts',
});

// Dedicated port so the run never collides with a dev server already on 3000.
// The server is started on it and the tests are pointed at it, so it is one constant:
// the two drifting apart boots a server nothing visits.
const PORT = 3100;

const isCI = !!process.env.CI;

// E2E_BASE_URL aims the suite at an already-running deployment — a local
// convenience. In CI it can only aim a merge-gating check at something that is
// not this PR's build: a run that is green against the live site says nothing
// about the commit under review, which is the entire claim the check makes.
// Refused rather than honoured, so the override is structurally local-only.
if (isCI && process.env.E2E_BASE_URL) {
  throw new Error(
    'E2E_BASE_URL is a local-only override: in CI the suite must run against the build this PR produced. Unset it.',
  );
}

const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

interface World {
  /** Handed to `scripts/seed-visual-diff.mjs` after the target directory. */
  seedFlags: readonly string[];
  /** Whatever the server needs beyond `VISUAL_DIFF_DATA_DIR`, which all three get. */
  env: Record<string, string>;
}

/**
 * What makes each world itself: how its tree is seeded, and what its server is
 * told. One entry per world rather than one table per field, so a world is read
 * in one place.
 *
 * Seeding is the server's job, never a test's — a scenario that seeds is a
 * scenario every other scenario has to run after.
 */
const WORLDS: Record<VdWorld, World> = {
  /* No declared container AND no daemon: the one machine answer accept still
     degrades to a copyable command for. `VISUAL_DIFF_FAKE_DOCKER` is declared
     rather than probed because `docker info` answers differently on a laptop
     with Docker Desktop running and on CI, and a scenario about what the panel
     says when there is no daemon must not depend on which ran it. */
  seeded: { seedFlags: [], env: { VISUAL_DIFF_FAKE_DOCKER: '0' } },
  sample: { seedFlags: ['--empty'], env: { VISUAL_DIFF_FAKE_DOCKER: '0' } },
};

/**
 * One visual-diff world: seed its tree, then boot the built console on it.
 *
 * The port comes out of `VD_HOSTS` rather than sitting beside it — the blog's
 * one-constant rule, so a server and the tests aimed at it cannot drift apart.
 * `VISUAL_DIFF_DATA_DIR` is absolute because `next start` runs with the app's
 * own workspace as its working directory, and a relative value would resolve
 * there, find nothing, and be reported as sample mode rather than as an error.
 */
function visualDiffServer(world: VdWorld) {
  const { seedFlags, env } = WORLDS[world];
  const url = VD_HOSTS[world];
  const port = new URL(url).port;
  const dataDir = vdWorldDir(world);
  const seed = ['scripts/seed-visual-diff.mjs', dataDir, ...seedFlags];

  return {
    command: `node ${seed.join(' ')} && pnpm --filter @gate/visual-diff-ui exec next start --port ${port}`,
    url,
    env: { VISUAL_DIFF_DATA_DIR: dataDir, ...env },
    reuseExistingServer: !isCI,
    timeout: 120_000,
  };
}

export default defineConfig({
  testDir,
  // playwright-bdd translates an `@only` tag on a scenario straight into
  // `test.only(...)`, which narrows the whole run to that one scenario and still
  // exits 0. Playwright enforces this in the load task, outside the filterOnly
  // branch, so it trips under `--list` too — which is what
  // scripts/suite-integrity.mjs leans on.
  forbidOnly: isCI,
  // `html` writes a report nobody opens unless something failed, so under CI the
  // job log would say nothing about which scenarios ran. `list` puts that where
  // a person reading the checks list actually looks.
  reporter: isCI
    ? [['list'], ['html', { open: 'never' }]]
    : [['html', { open: 'never' }]],
  timeout: 30_000,
  // Strictly below the e2e job's `timeout-minutes`. A job GitHub kills on its own
  // timeout skips its remaining steps — `if: always()` uploads included — so a
  // wedged run destroys the report and traces that would explain it. Playwright
  // ending the run itself flushes the reporter first and leaves the upload step
  // to run. MUST stay strictly below that job timeout if either ever moves.
  globalTimeout: 15 * 60 * 1000,
  expect: { timeout: 10_000 },
  // A retry cannot tell infra flake from a genuine race in the product; it
  // absorbs both, identically and silently. On a suite that gates merges — and
  // this repo auto-merges Dependabot PRs on `gate` — absorbing the second is
  // absorbing the finding. `failOnFlakyTests` makes a pass-on-retry red the run,
  // which leaves retry 1 buying only the report's flaky-vs-failed distinction
  // and retry 2 buying nothing at all (fail/fail/pass and fail/pass both red it)
  // at twice the worst-case per-test time.
  retries: isCI ? 1 : 0,
  failOnFlakyTests: isCI,
  // Parallel by SCENARIO, not by file — and this is the setting that matters.
  //
  // Without it Playwright schedules a file at a time, so every scenario inside one
  // runs serially in a single worker and the longest file is the floor no worker
  // count can lower. Measured, run 32947357701:
  //
  //     17.5 s  15 specs  visual-diff-report [desktop]   <- the floor
  //     15.5 s   7 specs  visual-diff-a11y   [desktop]
  //     12.5 s   7 specs  visual-diff-a11y   [mobile]
  //
  // That was proven the expensive way. Raising `workers` from 2 to 3 alone changed
  // the suite from 46.9 s to 46.9 s — not a rounding artefact, the same number —
  // because a third worker gets a FILE to run, never a share of the big one.
  //
  // Safe here because nothing is shared across scenarios: every page object in
  // `steps/acceptance/fixtures.ts` wraps the per-test `page`, `scenarioState` is a
  // fresh object per scenario, and the acceptance lane performs no successful
  // mutation — its one delete scenario asserts a REFUSAL. The mutating lane is
  // `playwright.local.config.ts`, a separate config this does not touch.
  fullyParallel: true,
  // Three, where the default gave two.
  //
  // Unset, Playwright takes `ceil(cpus / 2)`, and the observed default of 2 means
  // this runner reports 3 or 4 cores — the formula cannot distinguish them, and an
  // earlier version of this comment asserted four as though it could.
  //
  // THREE and not four, deliberately. Three `next start` servers share this runner
  // with the workers, and a browser driving an axe scan is the CPU-hungry half of
  // that pairing — NINE of the 41 scenarios run one (five in `a11y.feature`, four of
  // the seven in `visual-diff-a11y.feature`; the other three assert on how
  // violations are displayed and scan nothing). `failOnFlakyTests` above means
  // contention does not show up as a slow run: it shows up as a RED one. If the
  // runner turns out to have three cores, this is already full subscription and
  // should come back down.
  //
  // CI only. Locally the default reads the developer's own core count, which is the
  // right answer on a machine that is not a CI runner.
  workers: isCI ? 3 : undefined,
  use: {
    baseURL,
    // Trace the actual failing attempt, not only a retried run.
    trace: 'retain-on-failure',
  },
  // Two projects select on tags: @desktop → desktop only, @mobile → mobile only,
  // untagged → both. Pixel 5 is Android Chrome, so both share the one Chromium
  // install.
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      grepInvert: /@mobile/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
      grepInvert: /@desktop/,
    },
  ],
  // Three servers, all BUILT — production behavior (draft filtering, prerendered
  // routes, the real cache-tag invalidation), not a dev server's. `turbo run
  // e2e` builds both apps first, via the task dependencies in the root
  // turbo.json.
  webServer: [
    {
      command: `pnpm --filter @gate/blog exec next start --port ${PORT}`,
      url: baseURL,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    visualDiffServer('seeded'),
    visualDiffServer('sample'),
  ],
});
