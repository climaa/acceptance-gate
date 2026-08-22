import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

/**
 * The LOCAL lane — deliberately not the acceptance suite.
 *
 * `playwright.config.ts` runs `features/acceptance/` against built apps and
 * seeded worlds, and every one of its assertions names a seed fact. This config
 * answers a different question: does the console work against YOUR data — the
 * real `.visual-diff` tree the dev server on 3300 reads. Its requirements live
 * in `features/local/`, in the same Gherkin the acceptance lane uses, and they
 * are strictly READ-ONLY: nothing here may delete, prune, accept or start a job,
 * because the data behind the server is the one copy you have. That rule is a
 * tripwire rather than a promise — see `steps/local/fixtures.ts`.
 *
 * Because real data cannot be named, no scenario here asserts a label, a report
 * id or a count. They assert invariants BETWEEN values on the page: the buckets
 * sum to the total, the outcome word agrees with the exit code, every listed set
 * is offered to the pickers. The journeys that need named facts — the review
 * loop, the comparison modal, the accept gate — stay in the acceptance lane.
 *
 * The dev server is reused if `pnpm dev` already has it up, and booted (and torn
 * down) here if not.
 */

// A second, isolated BDD config. `outputDir` is explicit because the default is
// `.features-gen`, which belongs to the acceptance lane — two lanes generating
// into one directory would have each `bddgen` delete the other's specs. The
// `steps` glob is what binds these specs to THIS lane's `test`: it reaches
// `steps/local/fixtures.ts` and never the acceptance lane's, whose page objects
// navigate to absolute world URLs on 3200-3202.
const testDir = defineBddConfig({
  features: 'features/local/**/*.feature',
  steps: 'steps/local/**/*.ts',
  outputDir: '.features-gen-local',
});

const LOCAL_URL = 'http://localhost:3300';

// Real local data cannot exist in CI, so a CI run of this config could only
// ever be aimed at something that is not this PR's build — same reasoning as
// the E2E_BASE_URL refusal in the main config.
if (process.env.CI) {
  throw new Error(
    'playwright.local.config.ts validates the machine-local .visual-diff data: it has no meaning in CI. Run the acceptance suite instead.',
  );
}

export default defineConfig({
  testDir,
  // Separate artifact dirs so a local exploration never clobbers the last
  // acceptance run's report.
  outputDir: 'test-results-local',
  reporter: [['html', { open: 'never', outputFolder: 'playwright-report-local' }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: 0,
  use: {
    baseURL: LOCAL_URL,
    trace: 'retain-on-failure',
  },
  // One project. The console is a desktop surface, and the mobile presentations
  // that do differ — the comparison sheet below 768px — belong to scenarios this
  // lane deliberately does not carry.
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm --filter @gate/visual-diff-ui dev',
    url: LOCAL_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
