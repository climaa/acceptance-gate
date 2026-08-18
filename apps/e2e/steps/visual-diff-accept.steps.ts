import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import type { ConsolePage } from '../pages/console';
import type { ReportPage } from '../pages/report';
import { VD_HOSTS } from '../pages/visual-diff-hosts';
import { test } from './fixtures';
import { SEEDED_REPORT } from './visual-diff-report.steps';

const { Given, When, Then } = createBdd(test);

// Reused steps and their homes:
//   "a finished comparison report exists" → visual-diff-report.steps.ts
//   "I visit the console" / "I visit the mutating console"
//                                         → visual-diff-console.steps.ts

/** What packages/visual-diff/src/policy.mjs HOST pins — the fingerprint the
 *  accept gate compares against (D3). */
const PINNED_IMAGE = 'mcr.microsoft.com/playwright:v1.62.1-noble';

/**
 * The report an accept promotes from: the seeded world's clean comparison of
 * its two newest sets.
 *
 * Not `SEEDED_REPORT`, which carries the fabricated accessibility failure the
 * a11y suite is about. The gate asks accessibility first and refuses outright,
 * so on that report the review gate and the host warning — two of the four
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
  while ((await report.uncheckedCards().count()) > 0) {
    await report.uncheckedCards().first().getByRole('checkbox').first().check();
  }
}

Given('every variant of the report is reviewed', async ({ report }) => {
  await report.open(ACCEPT_REPORT);
  await reviewEverything(report);
  await expect(report.uncheckedCards()).toHaveCount(0);
});

Given('every variant of the mutating report is reviewed', async ({ report }) => {
  await report.open(ACCEPT_REPORT, 'mutating');
  await reviewEverything(report);
  await expect(report.uncheckedCards()).toHaveCount(0);
});

/** The D3 seam is SERVER-side: the mutating webServer boots with
 *  VISUAL_DIFF_FAKE_HOST_FINGERPRINT=<pinned image> (test-only env), so
 *  both the button gate and the server's own re-check see the pinned identity.
 *  A page.route mock could only fool the button — and if that were enough to
 *  write baselines, the gate would be client-side-only, which is itself a D3
 *  review failure. This step asserts the seam is live before relying on it.
 *
 *  The URL is absolute: `page.request` resolves a relative one against the
 *  config's `baseURL`, which is the blog on 3100 — a step that interrogated
 *  that server would fail while the seam it is checking was perfectly live. */
Given('the runner matches the pinned container', async ({ page }) => {
  const env = await page.request
    .get(`${VD_HOSTS.mutating}/api/env`)
    .then((response) => response.json());
  expect(env.image).toBe(PINNED_IMAGE);
});

/** The accept tab, on the report this scenario is about. Every question the
 *  gate asks below is about that report, so naming it is part of opening the
 *  tab rather than something a Then is left to assume. */
async function openAcceptTab(
  consolePage: ConsolePage,
  scenarioState: { acceptReport?: string },
) {
  await consolePage.selectJobMode('accept');
  await consolePage.chooseAcceptReport(scenarioState.acceptReport ?? ACCEPT_REPORT);
}

When('I select the accept job mode', async ({ console: consolePage, scenarioState }) => {
  await openAcceptTab(consolePage, scenarioState);
});

When('I run the accept', async ({ console: consolePage, scenarioState }) => {
  await openAcceptTab(consolePage, scenarioState);
  await consolePage.startButton.click();
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
  'I am warned that this host cannot accept baselines',
  async ({ console: consolePage }) => {
    await expect(consolePage.acceptHostAlert).toContainText(/bare-metal accept/);
    await expect(consolePage.startButton).toHaveCount(0);
  },
);

Then(
  'I can copy the container command instead of running it',
  async ({ console: consolePage }) => {
    await expect(consolePage.acceptDockerCommand).toContainText(PINNED_IMAGE);
    await expect(consolePage.acceptDockerCommand).toContainText('cli.mjs accept');
    await expect(consolePage.copyCommandButton).toBeVisible();
  },
);

Then('the baselines are rewritten and restamped', async ({ console: consolePage }) => {
  await expect(consolePage.liveLog).toContainText('BASELINE_ENV.json', {
    timeout: 60_000,
  });
  // The region draws the verdict first and the mode after it, in one row, with
  // no text between them — so the pair reads `succeeded` then `accept`, and
  // asserting them adjacent is what keeps this from passing on some other run's
  // outcome further down the panel.
  await expect(consolePage.currentJob).toContainText(/succeeded\s*accept/);
});

Then(
  'accept is refused because of the accessibility failure',
  async ({ console: consolePage }) => {
    await expect(consolePage.refusalAlert).toContainText(/accessibility/i);
    await expect(consolePage.startButton).toHaveCount(0);
  },
);
