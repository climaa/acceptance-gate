import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { VD_HOSTS } from '../../pages/visual-diff-hosts';
import { test } from './fixtures';
import { SEEDED_REPORT } from './visual-diff-report.steps';

const { Given, When, Then } = createBdd(test);

// Reused steps and their homes — one definition per Gherkin line:
//   "a shared comparison link is open" → visual-diff-share.steps.ts

/** The same comparison the shareable-link scenarios open. */
const KEY = 'templates__desktop__light__templates-posttemplate--long-prose';
const COMPARISON_URL = `${VD_HOSTS.seeded}/report/${SEEDED_REPORT}/compare/${KEY}`;

/** The story the seed grafts in as `added` — see seed/visual-diff/README.md. Its
 *  after set holds its screenshot, so the shot view it links to opens. */
const ADDED_KEY = 'organisms__desktop__light__organisms-siteheader--default';
const AFTER_SET = SEEDED_REPORT.split('__')[1];

Given('a comparison of an added story is open', async ({ page, modal }) => {
  await page.goto(`${VD_HOSTS.seeded}/report/${SEEDED_REPORT}/compare/${ADDED_KEY}`);
  await expect(modal.root).toBeVisible();
});

When('I open it beside its design', async ({ modal }) => {
  await modal.designLink.click();
});

// What a link from when the comparison could be read against a board carried.
When('I open a comparison link naming the pages board', async ({ page }) => {
  await page.goto(`${COMPARISON_URL}?against=design&board=05-pages`);
});

Then('no design board is offered', async ({ modal }) => {
  await expect(modal.root).toBeVisible();
  await expect(modal.against).toHaveCount(0);
  await expect(modal.boardPane).toHaveCount(0);
});

Then('the comparison modes are shown', async ({ modal }) => {
  await expect(modal.toolbar).toBeVisible();
});

Then('its after screenshot is shown beside a design board', async ({ page, shot }) => {
  await expect(page).toHaveURL(new RegExp(`/set/${AFTER_SET}/shot/${ADDED_KEY}$`));
  await expect(shot.boardPane).toBeVisible();
  await expect(shot.screenshotPane).toBeVisible();
});

Then('the comparison against its before is shown', async ({ modal }) => {
  await expect(modal.toolbar).toBeVisible();
  await expect(modal.mode('diff')).toHaveAttribute('aria-pressed', 'true');
  await expect(modal.boardPane).toHaveCount(0);
});
