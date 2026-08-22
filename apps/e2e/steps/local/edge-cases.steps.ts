import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { test } from './fixtures';

const { When, Then } = createBdd(test);

// Reused steps and their homes — one definition per Gherkin line:
//   "this console holds a finished comparison" / "I open one of my reports"
//   / "I filter by a term no story can match" / "the report says no story
//   matches the filter"                     → report.steps.ts

/** An address no capture set could ever produce a report id for. */
const ABSENT_REPORT = 'no-such-report__never-captured';

/** A path climb, url-encoded the way a browser would send it. `readReport`
 *  answers the same 404 for a malformed id as for a missing one, deliberately:
 *  a different answer would tell a prober which of the two it had found. */
const CLIMBING_REPORT = '..%2F..%2Fetc%2Fpasswd';

/** `lib/site.ts` — the copy, not the status. `/report/[id]` calls `notFound()`
 *  from inside a Suspense boundary, so the response is committed before the
 *  miss is discovered and only `proxy.ts` can turn it into a real 404 — and it
 *  only can when the data directory has a visible `reports/` tree. That makes
 *  the status a property of the machine; the words are the app's own. */
const NOT_FOUND_NOTE =
  'Nothing here — a report deleted since this link was drawn reads exactly like an address that never existed.';
const NOT_FOUND_ACTION = 'Back to the console';

When('I open a report address that does not exist', async ({ report }) => {
  await report.openHere(ABSENT_REPORT);
});

When('I open a report address shaped like a path climb', async ({ report }) => {
  await report.openHere(CLIMBING_REPORT);
});

Then(
  'the page says nothing is there and offers the way back to the console',
  async ({ page }) => {
    await expect(page.getByText(NOT_FOUND_NOTE)).toBeVisible();

    // The way back is the point: the shell's wordmark is not a link, so without
    // this the reader who followed a link the console itself drew is stranded.
    const back = page.getByRole('link', { name: NOT_FOUND_ACTION });
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute('href', '/');

    // Nothing leaked on the way out: a miss must not echo the address back, and
    // must not render a stack.
    await expect(page.locator('body')).not.toContainText('/etc/passwd');
  },
);
