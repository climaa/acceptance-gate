import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

// Generate Playwright specs from Gherkin .feature files + step definitions.
// The returned path is where `bddgen` writes the generated specs.
const testDir = defineBddConfig({
  features: 'features/**/*.feature',
  steps: 'steps/**/*.ts',
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
  use: {
    baseURL,
    // Trace the actual failing attempt, not only a retried run.
    trace: 'retain-on-failure',
  },
  // Two projects select on tags: @desktop → desktop only, @mobile → mobile only,
  // untagged → both. Pixel 5 is Android Chrome, so both projects run on the one
  // Chromium install.
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, grepInvert: /@mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 5'] }, grepInvert: /@desktop/ },
  ],
  // Boots the BUILT blog — production behavior (draft filtering, prerendered
  // routes), not a dev server's. `turbo run e2e` builds it first via the task
  // dependency in the root turbo.json.
  webServer: {
    command: `pnpm --filter @gate/blog exec next start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
