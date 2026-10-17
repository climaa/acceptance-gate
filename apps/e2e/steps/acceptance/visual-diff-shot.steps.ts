import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { endsWithWord } from '../../pages/comparison-modal';
import { VD_HOSTS } from '../../pages/visual-diff-hosts';
import { test } from './fixtures';

const { Given, When, Then } = createBdd(test);

// Reused steps and their homes — one definition per Gherkin line:
//   "the page has no accessibility violations" → a11y.steps.ts (blog suite)

/** The committed fixture set that carries a ledger beside its Badge — Accent
 *  shots, as a console capture writes one. See apps/visual-diff-ui/fixtures/
 *  README.md, "Token ledgers". */
const CAPTURED_SET = 'main-2026-08-30';

/** The one story these scenarios read, by the title the set viewer groups it
 *  under and the key its desktop light shot is stored as. */
const STORIES: Readonly<Record<string, string>> = {
  'Badge — Accent': 'atoms__desktop__light__atoms-badge--accent',
};

function keyOf(story: string): string {
  const key = STORIES[story];
  if (!key) throw new Error(`no shot is pinned for the story "${story}"`);

  return key;
}

const shotAddress = (label: string, story: string) =>
  `${VD_HOSTS.seeded}/set/${label}/shot/${keyOf(story)}`;

Given('a screenshot set captured from the console is open', async ({ page }) => {
  await page.goto(`${VD_HOSTS.seeded}/set/${CAPTURED_SET}`);
});

Given('the baselines screenshot set is open', async ({ page }) => {
  await page.goto(`${VD_HOSTS.seeded}/set/baselines`);
});

When('I open the {string} desktop light screenshot', async ({ shot }, story: string) => {
  await shot.setLink(story, 'desktop', 'light').click();
  await expect(shot.modal).toBeVisible();
});

// Opened from the set, as a reader does — so the readings arrive folded.
Given('the {string} screenshot is open', async ({ page, shot }, story: string) => {
  await page.goto(`${VD_HOSTS.seeded}/set/${CAPTURED_SET}`);
  await shot.setLink(story, 'desktop', 'light').click();
  await expect(shot.modal).toBeVisible();
});

When(
  "I load the {string} screenshot's address directly",
  async ({ page }, story: string) => {
    await page.goto(shotAddress(CAPTURED_SET, story));
  },
);

When('I unfold the spacing readings', async ({ shot }) => {
  await shot.unfold.click();
});

Then('it is shown beside a design board', async ({ shot }) => {
  await expect(shot.boardPane).toBeVisible();
  await expect(shot.screenshotPane).toBeVisible();
});

// Beneath the modal, not replaced by it: the set's own heading is still in the
// document, under the address of the screenshot.
Then('the set is still open beneath it', async ({ page }) => {
  await expect(page).toHaveURL(/\/shot\//);
  await expect(page.locator('h1', { hasText: CAPTURED_SET })).toBeAttached();
});

Then('the screenshot and the board fill the page', async ({ shot }) => {
  await expect(shot.modal).toHaveCount(0);
  await expect(shot.expanded).toBeVisible();
  await expect(shot.boardPane).toBeVisible();
  await expect(shot.screenshotPane).toBeVisible();
});

Then('there is a way back to the set', async ({ shot }) => {
  await expect(shot.backTo(CAPTURED_SET)).toHaveAttribute('href', `/set/${CAPTURED_SET}`);
});

Then(
  "the badge's padding-left reads {string} as {string}",
  async ({ shot }, value: string, token: string) => {
    const cells = shot.reading('padding-left').getByRole('cell');
    await expect(cells.nth(2)).toHaveText(endsWithWord(value));
    await expect(cells.nth(3)).toContainText(token);
  },
);

Then(
  'its padding-top reads {string} as exempt, {string}',
  async ({ shot }, value: string, reason: string) => {
    const cells = shot.reading('padding-top').getByRole('cell');
    await expect(cells.nth(2)).toHaveText(endsWithWord(value));
    await expect(cells.nth(3)).toContainText('exempt');
    await expect(cells.nth(3)).toContainText(reason);
  },
);

Then('the readings say this screenshot has no token ledger', async ({ shot }) => {
  await expect(
    shot.readingsText(
      'No token ledger for this screenshot. Capture a set from the console to read its spacing.',
    ),
  ).toBeVisible();
});
