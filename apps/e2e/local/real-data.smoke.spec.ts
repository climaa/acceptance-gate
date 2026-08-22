import { expect, test } from '@playwright/test';

import { ConsolePage } from '../pages/console';

/**
 * Read-only smoke checks against the DEV server and your real `.visual-diff`
 * data. These are environment validation, not product requirements — the
 * requirements live in `features/` and run against the seeded worlds, where
 * their assertions can name exact sets and counts. Here the data is whatever
 * your machine holds, so every assertion below is data-agnostic and nothing
 * ever clicks delete, prune, or start.
 *
 * The locators come from the same page object the acceptance suite trusts, so
 * a rename in the app fails both in the same place.
 */

test.describe('the console on real local data', () => {
  let console_: ConsolePage;

  test.beforeEach(async ({ page }) => {
    console_ = new ConsolePage(page);
    await page.goto('/');
  });

  test('serves real data, not the sample fixtures', async ({ page }) => {
    await expect(
      page.getByRole('heading', { level: 1, name: /visual-diff console/ }),
    ).toBeVisible();
    // The badge cannot appear via this lane's own webServer — the dev script
    // pre-creates the data directory, so it never reads as empty. What this
    // guards is the reused-server case: something else already on 3300 (a
    // leftover `next start`, a misconfigured VISUAL_DIFF_DATA_DIR) resolving
    // sample mode. The affirmative "real data is present" claim is the set
    // listing below, not this badge check.
    await expect(console_.sampleBadge).toHaveCount(0);
  });

  test('lists at least one snapshot set', async () => {
    // The real-data detector: a machine with nothing captured has a data
    // directory (the dev script creates one) but no sets to list.
    await expect(console_.setsTable).toBeVisible();
    await expect(console_.setRows.first()).toBeVisible();
  });

  test('offers all four job modes without touching any', async () => {
    for (const mode of ['capture', 'compare', 'run', 'accept'] as const) {
      await expect(console_.jobTab(mode)).toBeVisible();
    }
    await expect(console_.pickerA).toBeVisible();
    await expect(console_.pickerB).toBeVisible();
  });

  test('announces no refusal on a plain load', async () => {
    // Positive anchor first: `refusalAlert` is scoped under the main landmark,
    // and a dead or erroring page renders no `main` at all — without this line
    // the zero-count below would pass against a blank 500 page.
    await expect(console_.setsTable).toBeVisible();
    await expect(console_.refusalAlert).toHaveCount(0);
  });
});
