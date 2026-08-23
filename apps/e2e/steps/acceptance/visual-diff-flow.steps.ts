import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { test } from './fixtures';
import { BASELINE_SET } from './visual-diff-console.steps';

const { Given } = createBdd(test);

// Every other step this flow runs is shared with a scenario that stayed behind,
// so it keeps its home. Reused steps and theirs:
//   "I visit the mutating console" / "I launch the prepared comparison" /
//   "I try to start another job" / "I delete an unheld set" /
//   "I prune keeping the latest three sets" / "a job is already running"
//                                          → visual-diff-console.steps.ts
//   "every variant of the mutating report is reviewed" / "the runner matches
//   the pinned container" / "I run the accept"
//                                          → visual-diff-accept.steps.ts
//
// The job lock's `After` hook lives in visual-diff-console.steps.ts and applies
// to every scenario in the lane, this flow included: hooks are registered on the
// shared `test`, not per file. Moving `holdJobLock` here would mean moving that
// hook with it.

/**
 * The mutating world's own starting state, asserted rather than assumed.
 *
 * The seeded lane's Background (`the console has snapshot sets`) opens the
 * SEEDED console — `consolePage.open()` defaults to that world — which says
 * nothing about the tree these scenarios are about to wreck. This one names the
 * world it means.
 *
 * It runs before every scenario in the flow, so what it asserts has to hold at
 * every point in the chain, not just the first: the newest set survives the
 * delete (which retires the oldest unheld one) and the prune (which keeps the
 * latest three), so it is still listed when the last scenario starts.
 */
Given('the mutating console has snapshot sets', async ({ console: consolePage }) => {
  await consolePage.open('mutating');
  await expect(consolePage.setRow(BASELINE_SET.label)).toBeVisible();
});
