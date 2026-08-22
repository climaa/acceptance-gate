import { defineConfig, devices } from '@playwright/test';

/**
 * The LOCAL exploration config — deliberately not the acceptance suite.
 *
 * `playwright.config.ts` runs the `.feature` requirements against built apps and
 * seeded worlds, and every one of its assertions names seed facts. This config
 * answers a different question: does the console work against YOUR data — the
 * real `.visual-diff` tree the dev server on 3300 reads. Its specs live in
 * `local/`, are plain Playwright (no bddgen, no integrity guard, no scenario
 * count), and are strictly READ-ONLY: nothing here may delete, prune, or start
 * a job, because the data behind the server is the one copy you have.
 *
 * The dev server is reused if `pnpm dev` already has it up, and booted (and
 * torn down) here if not.
 */

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
  testDir: './local',
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
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm --filter @gate/visual-diff-ui dev',
    url: LOCAL_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
