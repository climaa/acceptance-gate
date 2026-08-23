import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import type { ConsolePage } from '../../pages/console';
import type { ReportPage } from '../../pages/report';
import { VD_PINNED_IMAGE } from '../../pages/visual-diff-hosts';
import { type ScenarioState, test } from './fixtures';
import { SEEDED_REPORT } from './visual-diff-report.steps';

const { Given, When, Then } = createBdd(test);

// Reused steps and their homes:
//   "a finished comparison report exists" → visual-diff-report.steps.ts
//   "I visit the console"                 → visual-diff-console.steps.ts

/**
 * The report an accept promotes from: the seeded world's clean comparison of
 * its two newest sets.
 *
 * Not `SEEDED_REPORT`, which carries the fabricated accessibility failure the
 * a11y suite is about. The gate asks accessibility first and refuses outright,
 * so on that report the review gate and the host warning — two of the three
 * scenarios in this file — are answers the console can never reach. The
 * accessibility scenario below says which report IT means, and everything else
 * here means this one.
 */
const ACCEPT_REPORT = 'main-2026-08-17__main-2026-08-16';

/** Review marks live in localStorage per context, so "everything is
 *  reviewed" is this context's state, invisible to every other scenario.
 *  Checking .first() unchecked each time is immune to the list re-sorting or
 *  collapsing as boxes are ticked — a .all() snapshot would go stale. */
async function reviewEverything(report: ReportPage) {
  // `.count()` is a one-shot query. Unlike an `expect` locator assertion it does
  // not retry, so on a report whose cards have not rendered yet it answers 0 —
  // the loop below never runs, and the `toHaveCount(0)` each caller makes after
  // it passes for the wrong reason: nothing is unreviewed because nothing is
  // there. The accept gate two steps later then correctly reports every variant
  // still unread, and the start button it disables never enables.
  //
  // Waiting for the first card is what makes the count a question about the
  // report rather than about the render.
  await expect(report.storyCards.first()).toBeVisible();

  while ((await report.uncheckedCards().count()) > 0) {
    await report.uncheckedCards().first().getByRole('checkbox').first().check();
  }
}

/** Reviewed, and provably so: `uncheckedCards` alone is 0 on a report with no
 *  cards at all, which is the state this helper exists to rule out. */
async function expectEverythingReviewed(report: ReportPage) {
  await expect(report.uncheckedCards()).toHaveCount(0);
  await expect(report.checkedCards()).not.toHaveCount(0);
}

Given('every variant of the report is reviewed', async ({ report }) => {
  await report.open(ACCEPT_REPORT);
  await reviewEverything(report);
  await expectEverythingReviewed(report);
});

/** The accept tab, on the report this scenario is about. Every question the
 *  gate asks below is about that report, so naming it is part of opening the
 *  tab rather than something a Then is left to assume. */
async function openAcceptTab(consolePage: ConsolePage, scenarioState: ScenarioState) {
  await consolePage.selectJobMode('accept');
  await consolePage.chooseAcceptReport(scenarioState.acceptReport ?? ACCEPT_REPORT);
}

When('I select the accept job mode', async ({ console: consolePage, scenarioState }) => {
  await openAcceptTab(consolePage, scenarioState);
});

Given(
  'the report still carries an accessibility failure',
  async ({ report, scenarioState }) => {
    await report.open(SEEDED_REPORT);
    await expect(report.bucketChip('a11y')).toContainText(/[1-9]/);
    // This is the report the console steps below are about — the one the whole
    // scenario names.
    scenarioState.acceptReport = SEEDED_REPORT;
  },
);

Then(
  'accept is unavailable while variants remain unreviewed',
  async ({ console: consolePage }) => {
    await expect(consolePage.startButton).toBeDisabled();
    await expect(consolePage.acceptGateNote).toContainText(/unreviewed/);
  },
);

Then(
  'I am told which switch to throw before accept can run',
  async ({ console: consolePage }) => {
    // The button is THERE and disabled, which is the change: accept off the
    // pinned image used to have none at all, because a promote stamps the
    // machine that wrote it. The console now starts that container itself, so
    // what is left to refuse is having no daemon to start it with — and that is
    // something a reviewer can act on rather than a dead end.
    await expect(consolePage.dockerRequiredNote).toContainText(/Docker is not running/);
    await expect(consolePage.startButton).toBeDisabled();
  },
);

Then(
  'I can copy the container command instead of running it',
  async ({ console: consolePage }) => {
    await expect(consolePage.acceptDockerCommand).toContainText(VD_PINNED_IMAGE);
    await expect(consolePage.acceptDockerCommand).toContainText('cli.mjs accept');
    await expect(consolePage.copyCommandButton).toBeVisible();
  },
);

Then(
  'accept is refused because of the accessibility failure',
  async ({ console: consolePage }) => {
    await expect(consolePage.refusalAlert).toContainText(/accessibility/i);
    await expect(consolePage.startButton).toHaveCount(0);
  },
);
