import * as fs from 'node:fs';
import * as path from 'node:path';

import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { vdWorldDir } from '../pages/visual-diff-hosts';
import { test } from './fixtures';

const { Given, When, Then, After } = createBdd(test);

/**
 * The seeded worlds' sets — cross-pinned by the seed script; every label,
 * branch and marker below routes through this constant.
 *
 * Five, not four. The mutating world runs its scenarios serially in the order
 * this feature declares them, so the delete lands before the prune: "keep the
 * latest three" only retires the oldest set if something newer than it is still
 * there once the deleted one is gone.
 */
export const SEEDED_SETS = [
  { label: 'main-2026-08-17', branch: 'main' },
  { label: 'main-2026-08-16', branch: 'main' },
  { label: 'main-2026-08-13', branch: 'main', dirty: true },
  { label: 'main-2026-08-12', branch: 'main' },
  { label: 'main-2026-08-11', branch: 'main', heldByWorktree: true },
] as const;

const DIRTY_SET = SEEDED_SETS[2];
/** The oldest set. A registered worktree holds it in the SEEDED world, which is
 *  where the refused delete runs; the mutating world registers no worktree, or
 *  the prune it owns would skip this row instead of retiring it. */
const HELD_SET = SEEDED_SETS[4];
const UNHELD_SET = SEEDED_SETS[3];
const [COMPARE_A, COMPARE_B] = [SEEDED_SETS[0].label, DIRTY_SET.label];

/** The one-job-at-a-time lock, as `apps/visual-diff-ui/lib/jobs.ts` publishes
 *  it: one file under the data directory, whose `pid` is the whole staleness
 *  test. */
const LOCK_FILE = 'job.lock';

/** The lock this suite is holding, or null. Module-scoped rather than carried
 *  through `scenarioState`, because the hook that releases it runs after the
 *  scenario's fixtures have been torn down. Safe: the `mutating` project runs
 *  one worker, so one process ever writes this. */
let heldLock: string | null = null;

/**
 * Take the mutating world's job lock.
 *
 * Written directly rather than taken by starting a job, because no job this
 * world can run outlives one poll of the console: `capture` and `run` report
 * the missing Storybook build and exit in milliseconds, and `compare` reads
 * eighteen tiny PNGs. The pid is this worker's and it is alive, so the server
 * reads the lock as held rather than reaping it as stale — which is exactly
 * what a real job's lock looks like.
 *
 * `wx`, so a lock a real job is holding is an error here rather than something
 * this quietly overwrites.
 */
function holdJobLock(mode: string, label: string): void {
  const file = path.join(vdWorldDir('mutating'), LOCK_FILE);
  const lock = { pid: process.pid, mode, label, startedAt: new Date().toISOString() };

  fs.writeFileSync(file, `${JSON.stringify(lock)}\n`, { flag: 'wx' });
  heldLock = file;
}

/** Release it, whatever the scenario came to: a lock left behind refuses every
 *  delete and every prune that follows it in this world. */
After(() => {
  if (heldLock === null) return;

  fs.rmSync(heldLock, { force: true });
  heldLock = null;
});

Given('the console has snapshot sets', async ({ console: consolePage }) => {
  // The webServer seeded the data dir before boot (no test seeds).
  // This step only verifies the world is the one the scenario assumes.
  await consolePage.open();
  await expect(consolePage.setRow(SEEDED_SETS[0].label)).toBeVisible();
});

Given('a job is already running', async ({ console: consolePage }) => {
  // The lock is not boot-seeded — a boot-time lock would deadlock every other
  // mutating scenario against the same server. This scenario owns its world
  // (serial project), so it creates the state it needs and asserts it.
  holdJobLock('capture', SEEDED_SETS[0].label);
  await consolePage.open('mutating');
  await expect(consolePage.currentJob).not.toContainText('Nothing running');
});

Given(
  'a snapshot set is held by a registered worktree',
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

When('I visit the mutating console', async ({ console: consolePage }) => {
  await consolePage.open('mutating');
});

When('I choose two sets to compare', async ({ console: consolePage }) => {
  await consolePage.chooseCompare(COMPARE_A, COMPARE_B);
});

When('I launch the prepared comparison', async ({ console: consolePage }) => {
  await consolePage.chooseCompare(COMPARE_A, COMPARE_B);
  await consolePage.startButton.click();
});

When('I try to start another job', async ({ console: consolePage }) => {
  await consolePage.selectJobMode('compare');
  // D1, as the run panel implements it: while the lock is held there is no
  // start control to press. Reaching for it IS the attempt, and what stands in
  // its place is the answer the Then reads. A POST that skips this UI meets the
  // same wall — `POST /api/jobs` answers 409 with the same sentence.
  await expect(consolePage.startButton).toHaveCount(0);
});

When('I delete the held set', async ({ console: consolePage }) => {
  await consolePage.deleteSet(HELD_SET.label);
});

When('I delete an unheld set', async ({ console: consolePage }) => {
  await consolePage.deleteSet(UNHELD_SET.label);
});

When('I prune keeping the latest three sets', async ({ console: consolePage }) => {
  // Confirmation included — destructive actions are never immediate (D2).
  await consolePage.pruneKeeping('3');
});

Then(
  'I see each snapshot set with its branch, story count and size',
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

Then("the live log runs to the job's end", async ({ console: consolePage }) => {
  await expect(consolePage.liveLog).toBeVisible();
  // Milestone, not growth: a fast job can finish between two reads, so the
  // assertion is the terminal line the contract pins, with time for a real run.
  await expect(consolePage.liveLog).toContainText(/exit \d/, { timeout: 60_000 });
});

Then('the finished job links to its report', async ({ console: consolePage }) => {
  await expect(consolePage.viewReportLink).toBeVisible({ timeout: 60_000 });
});

Then(
  'the console shows the running job instead of queueing mine',
  async ({ console: consolePage }) => {
    // User-facing copy per the contract — never the bare 409 code.
    await expect(consolePage.refusalAlert).toContainText('a job is already running');
    await expect(consolePage.currentJob).toContainText(/capture|compare|run|accept/);
  },
);

Then('the deletion is refused naming what holds it', async ({ console: consolePage }) => {
  await expect(consolePage.refusalAlert).toContainText(/worktree/i);
  await expect(consolePage.refusalAlert).toContainText(HELD_SET.label);
});

Then('that set is no longer listed', async ({ console: consolePage }) => {
  await expect(consolePage.setRow(UNHELD_SET.label)).toHaveCount(0);
});

Then('only the three latest sets remain', async ({ console: consolePage }) => {
  await expect(consolePage.setRows).toHaveCount(3);
  await expect(consolePage.setRow(HELD_SET.label)).toHaveCount(0);
});

Then(
  'the history lists each run with its outcome, exit code and duration',
  async ({ console: consolePage }) => {
    // Status vocabulary verbatim from the CLI — the contract's history row.
    await expect(consolePage.historyRow(/succeeded \(diffs\)/)).toBeVisible();
    const row = consolePage.historyRow(/succeeded \(diffs\)/).first();
    await expect(row).toContainText(/exit 1|\b1\b/);
    await expect(row).toContainText(/\d+m \d+s|\d+s/);
  },
);
