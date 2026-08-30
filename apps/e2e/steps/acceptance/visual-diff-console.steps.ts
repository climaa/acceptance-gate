import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { test } from './fixtures';

const { Given, When, Then } = createBdd(test);

/**
 * The seeded worlds' sets, each named for the part it plays. Cross-pinned by
 * `scripts/seed-visual-diff.mjs`, which restates the same five labels and
 * refuses to seed a world that does not match them.
 */

/** The A side of every comparison, and the newest row in the table. */
const BASELINE_SET = { label: 'main-2026-08-17', branch: 'main' } as const;

/** The fifth set. It exists so the table has a row between the compare pair and
 *  the two oldest, which is what makes "every set is listed with its identity"
 *  a claim about a list rather than about four special cases. */
const SPARE_SET = { label: 'main-2026-08-16', branch: 'main' } as const;

/** Captured from a working tree with uncommitted changes. Also the B side. */
const DIRTY_SET = { label: 'main-2026-08-13', branch: 'main', dirty: true } as const;

/** Nothing holds it — the counterpart to `HELD_SET` below, which is what makes
 *  the refused delete a claim about the hold and not about deleting. */
const UNHELD_SET = { label: 'main-2026-08-12', branch: 'main' } as const;

/** The oldest set, held by a registered worktree — which is the whole of what
 *  the refused delete is about. */
const HELD_SET = {
  label: 'main-2026-08-11',
  branch: 'main',
  heldByWorktree: true,
} as const;

/** Every set the seeded worlds hold, newest first — the order `sets.json` is written
 *  in and the console shows. */
const SEEDED_SETS = [BASELINE_SET, SPARE_SET, DIRTY_SET, UNHELD_SET, HELD_SET] as const;

const COMPARE_A = BASELINE_SET.label;
const COMPARE_B = DIRTY_SET.label;

Given('the console has screenshot sets', async ({ console: consolePage }) => {
  // The webServer seeded the data dir before boot (no test seeds).
  // This step only verifies the world is the one the scenario assumes.
  await consolePage.open();
  await expect(consolePage.setRow(BASELINE_SET.label)).toBeVisible();
});

Given(
  'a screenshot set is held by a registered worktree',
  async ({ console: consolePage }) => {
    // The hold itself is seed-tree state (a registered worktree entry); the row's
    // presence is what this step can assert — the refusal Then proves the hold.
    await consolePage.open();
    await expect(consolePage.setRow(HELD_SET.label)).toBeVisible();
  },
);

When('I visit the console', async ({ console: consolePage }) => {
  await consolePage.open();
});

When('I choose two sets to compare', async ({ console: consolePage }) => {
  await consolePage.chooseCompare(COMPARE_A, COMPARE_B);
});

/** The same pair a second time, which is the whole point: an ask whose content
 *  matches what the URL already carries still has to be obeyed. Driven through
 *  the same page method as the first press so the two are indistinguishable to
 *  the app — a bespoke second path here would prove something the reviewer never
 *  does. */
When('I choose the same two sets to compare', async ({ console: consolePage }) => {
  await consolePage.chooseCompare(COMPARE_A, COMPARE_B);
});

When('I switch to the capture job tab', async ({ console: consolePage }) => {
  await consolePage.selectJobMode('capture');
});

When('I ask the console to name the capture set', async ({ console: consolePage }) => {
  await consolePage.labelWand.click();
});

/** The tab and the address bar, and nothing else: no fields are filled, because
 *  what this scenario is about is that the selection survives a reload. */
When('I switch to the compare job tab', async ({ console: consolePage }) => {
  await consolePage.selectJobMode('compare');
});

/** A reload rather than a hand-built deep link. Typing the URL a test WISHES the
 *  app wrote proves only that the app can read it; reloading proves the address
 *  the app actually put in the bar is itself the link — which is the whole
 *  requirement. */
When('I reload the console', async ({ page }) => {
  await page.reload();
});

When('I delete the held set', async ({ console: consolePage }) => {
  await consolePage.deleteSet(HELD_SET.label);
});

Then(
  'I see each screenshot set with its branch, story count and size',
  async ({ console: consolePage }) => {
    for (const { label, branch } of SEEDED_SETS) {
      const row = consolePage.setRow(label);
      await expect(row).toBeVisible();
      await expect(row).toContainText(branch);
      await expect(row).toContainText(/\d+ stories/);
      await expect(row).toContainText(/MB|kB/);
    }
  },
);

Then(
  'a set captured from a dirty tree is marked as dirty',
  async ({ console: consolePage }) => {
    await expect(consolePage.setRow(DIRTY_SET.label).getByText('dirty')).toBeVisible();
  },
);

Then(
  'the job form is set to compare those two sets',
  async ({ console: consolePage }) => {
    await expect(consolePage.jobTab('compare')).toHaveAttribute('aria-selected', 'true');
    // Selection asserted through the option's text, not its value — the contract
    // pins option labels to set labels, values stay the app's business.
    await expect(consolePage.selectedOption(consolePage.pickerA)).toHaveText(COMPARE_A);
    await expect(consolePage.selectedOption(consolePage.pickerB)).toHaveText(COMPARE_B);
  },
);

Then('the URL carries the compare job mode', async ({ page }) => {
  await expect(page).toHaveURL(/\?mode=compare$/);
});

/**
 * The barrier this scenario needs, and the reason it is a step of its own rather
 * than a wait inside the next one. `router.replace` commits asynchronously: for a
 * window after the tab click the panel already reads `capture` while the address
 * bar still says `mode=compare`. Pressing compare inside that window is a press
 * against a navigation still in flight, and the RSC response for the ask re-renders
 * the panel into compare on its own — which makes the scenario pass while the
 * defect it is aimed at is untouched. Observed: without this, 12 of 12 runs passed
 * against the production build that reproduces the defect by hand.
 *
 * `toHaveURL` polls, so this is a barrier rather than a sleep.
 */
Then('the URL has dropped the compare job mode', async ({ page }) => {
  await expect(page).not.toHaveURL(/mode=compare/);
});

Then('the compare job tab is selected', async ({ console: consolePage }) => {
  await expect(consolePage.jobTab('compare')).toHaveAttribute('aria-selected', 'true');
});

Then('the deletion is refused naming what holds it', async ({ console: consolePage }) => {
  // The dialog, like every refusal a confirmation draws: this one is spoken
  // inside the delete dialog, which `Dialog` portals out of `main`.
  await expect(consolePage.dialogRefusal).toContainText(/worktree/i);
  await expect(consolePage.dialogRefusal).toContainText(HELD_SET.label);
});

Then(
  'the history lists each run with its outcome, exit code and duration',
  async ({ console: consolePage }) => {
    // Status vocabulary verbatim from the CLI — the contract's history row.
    const withDiffs = consolePage.historyRow(/succeeded \(diffs\)/).first();

    await expect(withDiffs).toBeVisible();
    // Per column, not against the row's text: the cells concatenate, and an
    // exit code of 1 next to a duration of 1m 35s has no boundary to anchor on.
    // `succeeded (diffs)` is the CLI's word for exit 1, so that is the number.
    await expect(consolePage.historyCell(withDiffs, 'exit')).toHaveText('1');
    await expect(consolePage.historyCell(withDiffs, 'took')).toHaveText(
      /^\d+m \d+s$|^\d+s$/,
    );
  },
);

/**
 * Nothing is named here, and nothing can be: the stem is the branch this suite
 * happens to be running on, and on CI that is a detached HEAD — which `lib/git`
 * records as the literal `detached`, a legal stem like any other.
 *
 * So the requirement is asserted as what it actually is: a label
 * `POST /api/jobs` would accept, ending in today's date, that none of the seeded
 * sets already holds. The exact-value cases are `__tests__/jobs.test.ts`'s job,
 * where a clock can be handed in.
 */
Then(
  'the label field holds a set label no screenshot set already uses',
  async ({ console: consolePage }) => {
    const today = new Date();
    const day = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');

    // `SET_LABEL`'s shape, restated rather than imported: this suite drives the
    // console through a browser and shares no module graph with it.
    await expect(consolePage.runField('label')).toHaveValue(
      new RegExp(`^[A-Za-z0-9][A-Za-z0-9.-]*-${day}(-\\d+)?$`),
    );

    const suggested = await consolePage.runField('label').inputValue();

    expect(SEEDED_SETS.map((set) => set.label)).not.toContain(suggested);
  },
);
