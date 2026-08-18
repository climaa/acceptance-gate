import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { test } from './fixtures';

const { Given, When, Then } = createBdd(test);

/** The report the seed tree ships — the #242 prose-rhythm regression trimmed to
 *  its telling variants. Exported: the a11y and accept steps files reuse it. */
export const SEEDED_REPORT = 'main-2026-08-17__main-2026-08-13';
/** Its two sides, which its id already names — a report is `<setA>__<setB>`. */
const REPORT_SETS = SEEDED_REPORT.split('__');
const CHANGED_STORY = 'PostTemplate — Long Prose';
const REMOVED_STORY = 'TagList — Empty';

/** Buckets come from packages/visual-diff/src/artifacts.mjs BUCKETS — the report
 *  chips must show exactly this vocabulary, no PCC leftovers like
 *  unchanged-with-warning. */
const BUCKETS = ['unchanged', 'changed', 'added', 'removed', 'errored', 'a11y'] as const;

Given('a finished comparison report exists', async ({ report }) => {
  await report.open(SEEDED_REPORT);
  await expect(report.reviewProgress).toBeVisible();
});

When('I open the report', async ({ report }) => {
  await report.open(SEEDED_REPORT);
});

When('I mark the first changed story as reviewed', async ({ report, scenarioState }) => {
  const progress = await report.reviewProgress.innerText();
  const parsed = progress.match(/reviewed (\d+)\/\d+/);
  if (!parsed)
    throw new Error(`review-progress text "${progress}" broke the pinned format`);
  scenarioState.reviewedBefore = Number(parsed[1]);
  await report.markReviewed(CHANGED_STORY);
});

When('I jump to the next unreviewed variant', async ({ report }) => {
  await report.nextUnreviewed.click();
});

When('I hide the reviewed variants', async ({ report }) => {
  await report.hideReviewed.check();
});

When("I filter by a story's title", async ({ report }) => {
  await report.filter.fill('Long Prose');
});

When('I walk the review loop with the keyboard', async ({ page, report }) => {
  // j = next variant, space = mark reviewed. Keyboard only: the flow the app
  // exists for must not need a pointer (F1).
  //
  // The walk is retried until it lands, because a document-level key handler is
  // the one control on this page with no actionability check of its own: a `j`
  // pressed in the window between the streamed HTML and its hydration is a key
  // nothing was listening for, and `page.keyboard` would report it as sent. A
  // click on a card would have waited; this has to wait for itself.
  await expect(async () => {
    await page.keyboard.press('j');
    await expect(report.storyCards.first()).toBeFocused({ timeout: 250 });
  }).toPass();
  await page.keyboard.press('Space');
});

When('I open the slider overlay on the first changed story', async ({ report }) => {
  await report.compareTool(CHANGED_STORY, 'slider overlay').click();
});

Given('the comparison modal is open', async ({ report, modal }) => {
  await report.open(SEEDED_REPORT);
  await report.compareTool(CHANGED_STORY, 'slider overlay').click();
  await expect(modal.root).toBeVisible();
});

When('I switch the modal to candidate', async ({ modal }) => {
  await modal.mode('candidate').click();
});

When('I switch the modal to blink', async ({ modal }) => {
  await modal.mode('blink').click();
});

When('I move the slider position', async ({ modal }) => {
  // The scrubber is the accessible control (contract); arrow keys move it.
  await modal.scrubber.focus();
  await modal.scrubber.press('ArrowRight');
});

When('I press escape', async ({ page }) => {
  await page.keyboard.press('Escape');
});

When('I open a report link carrying a story and slider mode', async ({ report }) => {
  await report.openDeepLink(SEEDED_REPORT, {
    story: 'templates-posttemplate--long-prose',
    mode: 'slider',
  });
});

Then('I see a count chip for every bucket', async ({ report }) => {
  for (const bucket of BUCKETS) {
    await expect(report.bucketChip(bucket)).toContainText(/\d+/);
  }
});

Then('both capture sets are identified above the results', async ({ report }) => {
  for (const label of REPORT_SETS) {
    await expect(report.setIdentity(label)).toBeVisible();
  }
});

Then('the corpus warning names the unstable stories', async ({ report }) => {
  await expect(report.warningStrip).toContainText(/unstable/);
});

Then('the review progress increases by one', async ({ report, scenarioState }) => {
  if (scenarioState.reviewedBefore === undefined) {
    throw new Error('reviewedBefore was never captured — the When step did not run');
  }
  // Pinned format "reviewed N/M", no inner spaces (contract).
  await expect(report.reviewProgress).toContainText(
    new RegExp(`reviewed ${scenarioState.reviewedBefore + 1}/`),
  );
});

Then('an unreviewed story card is scrolled into view', async ({ report }) => {
  await expect(report.uncheckedCards().first()).toBeInViewport();
});

Then('no reviewed story card remains visible', async ({ report }) => {
  // Hidden = removed from the DOM (contract) — count, not visibility.
  await expect(report.checkedCards()).toHaveCount(0);
});

Then('only story cards matching the filter remain visible', async ({ report }) => {
  await expect(report.storyCards).toHaveCount(1);
  await expect(report.storyCard(CHANGED_STORY)).toBeVisible();
});

Then(
  'the removed story shows a placeholder for the side it never had',
  async ({ report }) => {
    await expect(report.missingSide(REMOVED_STORY)).toBeVisible();
  },
);

Then('the walked variant is marked reviewed without a pointer', async ({ report }) => {
  await expect(report.checkedCards().first()).toBeVisible();
});

Then('the comparison modal is open with slider mode active', async ({ modal }) => {
  await expect(modal.root).toBeVisible();
  await expect(modal.mode('slider')).toHaveAttribute('aria-pressed', 'true');
});

Then('the modal shows only the candidate shot', async ({ modal }) => {
  await expect(modal.mode('candidate')).toHaveAttribute('aria-pressed', 'true');
  await expect(modal.divider).toBeHidden();
});

Then('the shot alternates between baseline and candidate', async ({ modal }) => {
  // Blink swaps the visible shot roughly every 400 ms (contract) — both roles
  // must be observed within a couple of cycles.
  await expect(
    modal.shot.and(modal.root.getByRole('img', { name: 'baseline' })),
  ).toBeVisible();
  await expect(
    modal.shot.and(modal.root.getByRole('img', { name: 'candidate' })),
  ).toBeVisible({
    timeout: 2_000,
  });
});

Then('the divider follows the scrubber', async ({ modal }) => {
  const position = await modal.scrubber.getAttribute('aria-valuenow');
  await expect(modal.divider).toBeVisible();
  // The contract pins aria-valuenow as the mirror of the divider — one arrow
  // press must have moved it off the midpoint default.
  expect(Number(position)).not.toBe(50);
});

Then('the comparison modal is closed', async ({ modal }) => {
  await expect(modal.root).toBeHidden();
});
