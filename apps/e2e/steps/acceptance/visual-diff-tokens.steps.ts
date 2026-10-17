import * as fs from 'node:fs';
import * as path from 'node:path';

import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { endsWithWord } from '../../pages/comparison-modal';
import { VD_HOSTS, vdWorldDir } from '../../pages/visual-diff-hosts';
import { test } from './fixtures';

const { Given, When, Then } = createBdd(test);

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const NO_LAYOUT: Rect = { x: 0, y: 0, width: 0, height: 0 };

/** The area two rectangles share, 0 when they are apart. */
const overlapArea = (a: Rect, b: Rect): number =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

// Reused steps and their homes — one definition per Gherkin line:
//   "a shared comparison link is open"         → visual-diff-share.steps.ts
//   "I compare it to the design"               → visual-diff-design.steps.ts
//   "the page has no accessibility violations" → a11y.steps.ts (blog suite)

/** The fixture report that reads #460 backwards: its after side is the Dialog
 *  story with the browser's own button, so its token ledgers carry a real
 *  regression. See apps/visual-diff-ui/fixtures/README.md, "Token ledgers". */
const DIALOG_REPORT = 'main-2026-10-13__main-2026-09-17';
const DIALOG_KEY = 'organisms__desktop__dark__organisms-dialog--open';
const DIALOG_TITLE = 'Dialog — Open';
const DIALOG_URL = `${VD_HOSTS.seeded}/report/${DIALOG_REPORT}/compare/${DIALOG_KEY}`;

/** A compare against `baselines`: the committed corpus carries no ledgers, so
 *  the readings can only come from the after side. */
const BASELINES_REPORT = 'baselines__main-2026-08-24';
const BASELINES_KEY = 'atoms__desktop__dark__atoms-iconbutton--disabled';

Given("the dialog's comparison is open", async ({ page, modal }) => {
  await page.goto(DIALOG_URL);
  await expect(modal.root).toBeVisible();
});

Given("the dialog's design view is open", async ({ page, modal }) => {
  await page.goto(`${DIALOG_URL}?against=design`);
  await expect(modal.readings).toBeVisible();
});

Given('a comparison against the baselines is open', async ({ page, modal }) => {
  await page.goto(
    `${VD_HOSTS.seeded}/report/${BASELINES_REPORT}/compare/${BASELINES_KEY}`,
  );
  await expect(modal.root).toBeVisible();
});

When(
  "I focus the {string} button's padding-right reading",
  async ({ modal }, name: string) => {
    await modal.reading(`button "${name}"`, 'padding-right').getByRole('button').focus();
  },
);

When("I open the dialog's report", async ({ report }) => {
  await report.open(DIALOG_REPORT);
});

Then(
  'the readings list spacing that changed between before and after',
  async ({ modal }) => {
    await expect(modal.readingsText('changed between before and after')).toBeVisible();
    await expect(modal.readings.getByRole('row').nth(1)).toBeVisible();
  },
);

Then(
  "the {string} button's padding-right went from {string} to {string}, browser default",
  async ({ modal }, name: string, before: string, after: string) => {
    const row = modal.reading(`button "${name}"`, 'padding-right');
    await expect(row).toHaveCount(1);

    // Each cell on its own: the page never writes "before → after" as one
    // sentence, so a step that assembled one would assert nothing it shows.
    // As cards a cell's text leads with its column header, hence the anchor.
    const cells = row.getByRole('cell');
    await expect(cells.nth(2)).toHaveText(endsWithWord(before));
    await expect(cells.nth(3)).toContainText(after);
    await expect(cells.nth(3)).toContainText('browser default');
  },
);

Then('its box is marked on the after screenshot', async ({ modal }) => {
  await expect(modal.emphasizedBox).toHaveCount(1);

  // No layout reads as an empty rectangle, which overlaps nothing.
  const box = (await modal.emphasizedBox.boundingBox()) ?? NO_LAYOUT;
  const shot = (await modal.shotNamed('candidate').boundingBox()) ?? NO_LAYOUT;
  expect(
    overlapArea(box, shot),
    'the emphasized box sits off the after screenshot',
  ).toBeGreaterThan(0);
});

Then('the readings come from the after screenshot alone', async ({ modal }) => {
  await expect(modal.readingsText('after side · off-scale only')).toBeVisible();
  await expect(modal.readingsText('No token ledger for this comparison.')).toHaveCount(0);
});

Then('the readings say this comparison has no token ledger', async ({ modal }) => {
  await expect(modal.readingsText('No token ledger for this comparison.')).toBeVisible();
});

Then('the dialog story is still counted as changed', async ({ report }) => {
  // The count the served report recorded, read from the world it was served
  // from: readings are reference, so the chip must say exactly what the
  // compare said before any ledger existed.
  const summary = JSON.parse(
    fs.readFileSync(
      path.join(vdWorldDir('seeded'), 'reports', DIALOG_REPORT, 'summary.json'),
      'utf8',
    ),
  ) as { counts: { changed: number } };

  await expect(
    report.storyCard(DIALOG_TITLE).locator('.ds-bucket-chip__label'),
  ).toHaveText('changed');
  await expect(report.bucketCount('changed')).toHaveText(String(summary.counts.changed));
});
