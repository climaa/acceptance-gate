import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { test } from './fixtures';

const { When, Then } = createBdd(test);

// Sample mode is the empty-data default — the same app booted with no seeded
// tree (the deployed instance's natural state), reached on its own world
// (the third webServer entry, port 3201).

When('I visit the sample console', async ({ console: consolePage }) => {
  await consolePage.open('sample');
});

When('I open the sample report', async ({ console: consolePage }) => {
  await consolePage.sampleReportLink.click();
});

Then('the sample badge is visible', async ({ console: consolePage }) => {
  await expect(consolePage.sampleBadge).toBeVisible();
});

Then(
  'starting a job is disabled with an explanation',
  async ({ console: consolePage, page }) => {
    await expect(consolePage.startButton).toBeDisabled();
    await expect(page.getByRole('note', { name: 'sample mode' })).toContainText(/no CLI/);
  },
);
