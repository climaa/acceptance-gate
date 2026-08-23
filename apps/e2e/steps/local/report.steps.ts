import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { test } from './fixtures';
import type { ReportPage } from '../../pages/report';

const { Given, When, Then } = createBdd(test);

/** Every chip the row draws. `total` is not a bucket — it is the row's "no
 *  filter" chip and its count is the sum of the six beneath it. */
const BUCKETS = ['changed', 'added', 'removed', 'errored', 'a11y', 'unchanged'] as const;
const TOTAL_CHIP = 'total';

/**
 * The three answers the report gives when there is nothing under the bar, all
 * pinned in `components/ReportResults.tsx` and `lib/report-view.ts`. Reading the
 * wrong one as "your filter is too narrow" is how a passing run gets mistaken
 * for a broken screen, so a scenario that lands on an empty view has to see one
 * of these rather than blank space.
 */
const NOTHING_MOVED =
  'Nothing moved — every variant matched its baseline, so the run wrote no rows to review.';
const EMPTY_UNCHANGED =
  'unchanged variants are counted, never written — the differ keeps their number and drops their rows, so there is nothing here to open.';
const NOTHING_MATCHES =
  'No story matches this filter — clear the search box or pick another bucket.';

/** A search term no story id or title can carry — it is not a substring of
 *  anything, on any machine's corpus. */
const NO_MATCH_TERM = 'zzz-no-story-can-match-this-zzz';

/** Reads a chip's count off the page. The number is the chip's description
 *  rather than part of its name, so it is read from the element instead of
 *  parsed back out of the chip's own text. */
async function countOf(report: ReportPage, bucket: string): Promise<number> {
  return Number((await report.bucketCount(bucket).innerText()).trim());
}

Given('this console holds a finished comparison', async ({ console: vd }) => {
  await vd.openHere();
  await expect(
    vd.reportRows.filter({ hasText: /__/ }),
    'This lane reads YOUR comparisons, and this console holds none. Compare two capture ' +
      'sets first — pick A and B on the console and start a compare.',
  ).not.toHaveCount(0);
});

/** The console itself, as a destination rather than a precondition — the one
 *  scenario that reaches a report the way a reader would, through the link the
 *  console drew. */
When('I visit my console', async ({ console: vd }) => {
  await vd.openHere();
  await expect(vd.setsTable).toBeVisible();
});

When('I open the first listed report', async ({ page, console: vd, localState }) => {
  const link = vd
    .reportLink(vd.reportRows.filter({ has: page.getByRole('cell') }).first())
    .first();
  localState.reportId = (await link.innerText()).trim();
  await link.click();
});

/** The shared way in for every scenario that does not care which report: back to
 *  the console, then through its own link, so the id is one the console drew
 *  rather than one a test invented. */
When('I open one of my reports', async ({ page, console: vd, report, localState }) => {
  await vd.openHere();
  const link = vd
    .reportLink(vd.reportRows.filter({ has: page.getByRole('cell') }).first())
    .first();
  localState.reportId = (await link.innerText()).trim();
  await link.click();
  await expect(report.header).toBeVisible();
});

Then('the report names itself in its heading', async ({ page, report, localState }) => {
  const id = localState.reportId;
  expect(id, 'no report was opened before this assertion').toBeTruthy();
  if (!id) return;

  await expect(report.header).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: id })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/report/${escapeRegExp(id)}$`));
});

Then(
  'both compared sets are identified above the results',
  async ({ report, localState }) => {
    const id = localState.reportId;
    expect(id, 'no report was opened before this assertion').toBeTruthy();
    if (!id) return;

    // A report id is `<setA>__<setB>`, and set labels forbid `_` so the split is
    // unambiguous. An id carrying no `__` cannot name its sides at all —
    // `reportSides` falls back to the generic pair — so there is nothing to check
    // it against, and the scenario asserts only what such an id can prove.
    const [a, b] = id.split('__');
    if (a === undefined || b === undefined) {
      await expect(report.header).toContainText(/baseline/);

      return;
    }

    await expect(report.setIdentity(a)).toBeVisible();
    await expect(report.setIdentity(b)).toBeVisible();
  },
);

Then('the total chip equals the sum of the buckets beneath it', async ({ report }) => {
  // Every chip is drawn, including the ones sitting at zero — the row is the
  // report's verdict, and a bucket the run did not produce still has a number.
  await expect(report.bucketChips).toHaveCount(BUCKETS.length + 1);

  const counts = await Promise.all(BUCKETS.map((bucket) => countOf(report, bucket)));
  const total = await countOf(report, TOTAL_CHIP);

  // Anchored above zero: a report of nothing at all would make the sum trivially
  // agree, and there is no such thing — a comparison that ran counted something.
  expect(total, 'the report counts no variants at all').toBeGreaterThan(0);
  expect(counts.reduce((sum, n) => sum + n, 0)).toBe(total);
});

Then(
  'selecting each bucket shows its stories or explains why there are none',
  async ({ report }) => {
    // Counted and written are two different numbers, and the gap between them is
    // the whole `unchanged` rule: the differ keeps their count and drops their
    // rows. So what a chip should show is not its own count — it is how much of
    // that count survived into rows.
    const total = await countOf(report, TOTAL_CHIP);
    const unchanged = await countOf(report, 'unchanged');
    const written = total - unchanged;

    // Every chip, every time — which is what keeps this non-vacuous on the
    // commonest real report of all: a run where nothing moved counts every
    // variant as unchanged and writes no rows for any bucket.
    for (const bucket of [...BUCKETS, TOTAL_CHIP]) {
      const count = await countOf(report, bucket);
      await report.bucketChip(bucket).click();
      await expect(report.bucketChip(bucket)).toHaveAttribute('aria-pressed', 'true');

      // `total` selects no bucket, so it shows everything that was written;
      // `unchanged` was never written at all; every other chip shows its own.
      const expectedRows =
        bucket === TOTAL_CHIP ? written : bucket === 'unchanged' ? 0 : count;
      const hasRows = expectedRows > 0;

      if (hasRows) {
        await expect(report.storyCards.first()).toBeVisible();
        const reported = await report.cardBuckets.allInnerTexts();
        expect(reported.length).toBeGreaterThan(0);
        // Under `total` the cards are every bucket at once, so only a chip that
        // named a bucket can claim the cards all report it.
        if (bucket !== TOTAL_CHIP) {
          for (const word of reported) expect(word.trim()).toBe(bucket);
        }
        continue;
      }

      await expect(report.storyCards).toHaveCount(0);
      // One of the three answers, never blank space — and never the wrong one:
      // asking for `unchanged` is answered by the rule, not by "your filter is
      // too narrow".
      await expect(report.emptyMessage).toHaveText(
        bucket === 'unchanged'
          ? oneOf(EMPTY_UNCHANGED, NOTHING_MOVED)
          : oneOf(NOTHING_MOVED, NOTHING_MATCHES),
      );
    }
  },
);

Then('the review progress counts every bucket except unchanged', async ({ report }) => {
  const unchanged = await countOf(report, 'unchanged');
  const total = await countOf(report, TOTAL_CHIP);

  // Pinned format, no inner spaces around the slash.
  await expect(report.reviewProgress).toHaveText(
    new RegExp(`^reviewed \\d+/${total - unchanged}$`),
  );
});

When('I narrow the report to a bucket and a search term', async ({ page, report }) => {
  await report.bucketChip('unchanged').click();
  await report.filter.fill(NO_MATCH_TERM);
  // The URL is written on a debounce; wait for it rather than for a duration.
  await expect(page).toHaveURL(/[?&]filter=/);
});

Then(
  'reloading the page restores that bucket and that search term',
  async ({ page, report }) => {
    await page.reload();

    await expect(report.filter).toHaveValue(NO_MATCH_TERM);
    await expect(report.bucketChip('unchanged')).toHaveAttribute('aria-pressed', 'true');
  },
);

/** Any one of these sentences, matched literally. The copy carries em dashes and
 *  parentheses, so it is escaped rather than trusted as a pattern. */
function oneOf(...sentences: string[]): RegExp {
  return new RegExp(sentences.map(escapeRegExp).join('|'));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
