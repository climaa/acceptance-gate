import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

// Generate Playwright specs from Gherkin .feature files + step definitions.
// The returned path is where `bddgen` writes the generated specs.
const testDir = defineBddConfig({
  features: 'features/**/*.feature',
  steps: 'steps/**/*.ts',
});

// Dedicated port so the run never collides with a dev server already on 3000.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';

export default defineConfig({
  testDir,
  reporter: [['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // Retries are CI-only backstop for infra flake; locally a real failure is
  // never masked by a passing re-run.
  retries: process.env.CI ? 2 : 0,
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
    command: 'pnpm --filter @gate/blog exec next start --port 3100',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
