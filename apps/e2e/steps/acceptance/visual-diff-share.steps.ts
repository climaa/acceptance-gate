import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { VD_HOSTS } from '../../pages/visual-diff-hosts';
import { test } from './fixtures';
import { SEEDED_REPORT } from './visual-diff-report.steps';

const { Given, When, Then } = createBdd(test);

/** The seeded report's long-prose regression, by its variant key — the address
 *  a reviewer copies. The same story `the comparison modal is open` opens. */
const SHARED_KEY = 'templates__desktop__light__templates-posttemplate--long-prose';

const REPORT_URL = `${VD_HOSTS.seeded}/report/${SEEDED_REPORT}`;
const SHARED_URL = `${REPORT_URL}/compare/${SHARED_KEY}`;

When('I open a shared comparison link', async ({ page }) => {
  await page.goto(SHARED_URL);
});

Given('a shared comparison link is open', async ({ page, modal }) => {
  await page.goto(SHARED_URL);
  await expect(modal.root).toBeVisible();
});

When('I go back in the browser', async ({ page }) => {
  await page.goBack();
});

When(
  'I request a comparison the report does not hold',
  async ({ page, scenarioState }) => {
    scenarioState.response = await page.goto(
      `${REPORT_URL}/compare/templates__desktop__light__templates-posttemplate--gone`,
    );
  },
);

When('I copy the comparison link', async ({ context, modal }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: VD_HOSTS.seeded,
  });
  await modal.copyLink.click();
});

Then('the comparison modal shows the before, after and diff shots', async ({ modal }) => {
  await expect(modal.root).toBeVisible();
  // One shot at a time is the modal's design: each kind is asked for by the
  // mode that shows it, and each must load real pixels, not an empty frame.
  for (const kind of ['baseline', 'candidate', 'diff'] as const) {
    await modal.mode(kind).click();
    await expect(modal.shotNamed(kind)).toBeVisible();
    await expect
      .poll(() =>
        modal.shotNamed(kind).evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);
  }
});

Then("I am on the comparison's report", async ({ page, modal }) => {
  await expect(page).toHaveURL(REPORT_URL);
  await expect(modal.root).toBeHidden();
});

Then("the clipboard holds the comparison's address", async ({ page, modal }) => {
  await expect(modal.copyStatus).toHaveText('link copied');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(page.url());
  expect(new URL(copied).pathname).toMatch(
    new RegExp(`^/report/${SEEDED_REPORT}/compare/[^/]+$`),
  );
});
