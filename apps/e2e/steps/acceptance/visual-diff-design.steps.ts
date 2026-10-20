import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { VD_HOSTS } from '../../pages/visual-diff-hosts';
import { test } from './fixtures';
import { SEEDED_REPORT } from './visual-diff-report.steps';

const { Given, When, Then } = createBdd(test);

/** The same comparison the shareable-link scenarios open: a template, so it
 *  opens on the pages board by default. */
const KEY = 'templates__desktop__light__templates-posttemplate--long-prose';
const COMPARISON_URL = `${VD_HOSTS.seeded}/report/${SEEDED_REPORT}/compare/${KEY}`;

Given('the design view is open', async ({ page, modal }) => {
  await page.goto(`${COMPARISON_URL}?against=design`);
  await expect(modal.boardPane).toBeVisible();
});

When('I compare it to the design', async ({ modal }) => {
  await modal.against.getByRole('button', { name: 'design', exact: true }).click();
});

When('I zoom the board in and back out', async ({ modal }) => {
  await modal.zoom('zoom in').click();
  await expect(modal.zoomReadout).toHaveText('150%');
  await modal.zoom('zoom out').click();
});

When('I pick the console board', async ({ modal }) => {
  await modal.boardPicker.getByRole('button', { name: 'console', exact: true }).click();
});

When('I open a comparison link naming the pages board', async ({ page }) => {
  await page.goto(`${COMPARISON_URL}?against=design&board=05-pages`);
});

Then('a design board is shown beside the after screenshot', async ({ modal }) => {
  // A template opens on its tier's board.
  await expect(modal.board('templates')).toBeVisible();
  await expect(modal.shotNamed('candidate')).toBeVisible();
  await expect
    .poll(() =>
      modal.board('templates').evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
});

Then('the comparison modes are gone', async ({ modal }) => {
  await expect(modal.toolbar).toHaveCount(0);
});

Then('the board is at 100% and cannot be zoomed out further', async ({ modal }) => {
  await expect(modal.zoomReadout).toHaveText('100%');
  await expect(modal.zoom('zoom out')).toBeDisabled();
});

Then('the console board is shown', async ({ modal }) => {
  await expect(modal.board('console')).toBeVisible();
});

Then('the pages board is shown', async ({ modal }) => {
  await expect(modal.board('pages')).toBeVisible();
  await expect(modal.boardPane).toBeVisible();
});
