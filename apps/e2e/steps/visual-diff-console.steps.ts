import * as fs from 'node:fs';
import * as path from 'node:path';

import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import type { JobMode } from '../pages/console';
import { vdWorldDir } from '../pages/visual-diff-hosts';
import { test } from './fixtures';

const { Given, When, Then, After } = createBdd(test);

/**
 * The seeded worlds' sets, each named for the part it plays. Cross-pinned by
 * `scripts/seed-visual-diff.mjs`, which restates the same five labels and
 * refuses to seed a world that does not match them.
 */

/** The A side of every comparison, and the newest row in the table. */
const BASELINE_SET = { label: 'main-2026-08-17', branch: 'main' } as const;

/** The fifth set, and the reason there are five. The mutating world runs its
 *  scenarios in the order the feature declares them, so the delete lands before
 *  the prune — and "keep the latest three" only retires the oldest set if
 *  something newer than it survives that delete. */
const SPARE_SET = { label: 'main-2026-08-16', branch: 'main' } as const;

/** Captured from a working tree with uncommitted changes. Also the B side. */
const DIRTY_SET = { label: 'main-2026-08-13', branch: 'main', dirty: true } as const;

/** Nothing holds it, so the delete scenario can retire it. */
const UNHELD_SET = { label: 'main-2026-08-12', branch: 'main' } as const;

/** The oldest set. A registered worktree holds it in the SEEDED world, which is
 *  where the refused delete runs; the mutating world registers no worktree, or
 *  the prune it owns would skip this row instead of retiring it. */
const HELD_SET = {
  label: 'main-2026-08-11',
  branch: 'main',
  heldByWorktree: true,
} as const;

/** Every set the worlds hold, newest first — the order `sets.json` is written
 *  in and the console shows. */
const SEEDED_SETS = [BASELINE_SET, SPARE_SET, DIRTY_SET, UNHELD_SET, HELD_SET] as const;

const COMPARE_A = BASELINE_SET.label;
const COMPARE_B = DIRTY_SET.label;

/**
 * The pair the mutating world LAUNCHES, which is deliberately not the pair the
 * seeded world pre-fills.
 *
 * A compare's report is named `<A>__<B>`, and the seed already writes
 * `main-2026-08-17__main-2026-08-13` (report-graft.json) and
 * `main-2026-08-17__main-2026-08-16` (report-accept.json) into every world.
 * Launching either of those overwrites a report the panel is ALREADY listing,
 * so "the console lists it" would have been true before the job ran — a green
 * that proves the seed rather than the run. This pair names a report no seed
 * writes, which is the whole reason the assertion can fail.
 *
 * Both sets survive this world's delete and its prune-to-latest-three, so the
 * scenario stays independent of the order the others run in.
 */
const LAUNCH_A = SPARE_SET.label;
const LAUNCH_B = DIRTY_SET.label;
const LAUNCH_REPORT = `${LAUNCH_A}__${LAUNCH_B}`;

/** The one-job-at-a-time lock, as `apps/visual-diff-ui/lib/jobs.ts` publishes
 *  it: one file under the data directory, whose `pid` is the whole staleness
 *  test. */
const LOCK_FILE = 'job.lock';

interface SeededRun {
  mode: JobMode;
  label: string;
  startedAt: string;
}

/**
 * The seeded history row the fake lock impersonates: a capture that never
 * reported, which `history.json` carries with `endedAt`, `exitCode` and
 * `reportId` all null.
 *
 * Pointing the lock at a row the seed already holds is what lets the history
 * assertion mean anything. Those three nulls are ALSO what a live job's row
 * looks like — `startJob` writes them and only the end of the job patches them —
 * so on disk this row and a running one are the same row, and only the lock
 * says which it is. Take the lock and the console must read it as `running`;
 * drop the lock and the same row is `interrupted` again, which is why the
 * `After` hook below needs to restore nothing.
 *
 * `id` is not stored: lib/jobs.ts derives it from `startedAt` and `mode`, so
 * these two fields are what tie the lock to the row.
 */
const INTERRUPTED_RUN: SeededRun = {
  mode: 'capture',
  label: 'main-2026-08-16',
  startedAt: '2026-08-16T07:12:44Z',
};

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
function holdJobLock(run: SeededRun): void {
  const file = path.join(vdWorldDir('mutating'), LOCK_FILE);
  const lock = { pid: process.pid, ...run };

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
  await expect(consolePage.setRow(BASELINE_SET.label)).toBeVisible();
});

Given('a job is already running', async ({ console: consolePage }) => {
  // The lock is not boot-seeded — a boot-time lock would deadlock every other
  // mutating scenario against the same server. This scenario owns its world
  // (serial project), so it creates the state it needs and asserts it.
  holdJobLock(INTERRUPTED_RUN);
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
  await consolePage.chooseCompare(LAUNCH_A, LAUNCH_B);
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
  'the console lists that report without a reload',
  async ({ console: consolePage }) => {
    // Never reloaded: this page has been open since before the job was launched,
    // and the only thing that re-read the server since is the poller's own
    // `router.refresh()`, fired once when it saw the job finish. The reports panel
    // used to redraw from a `use cache` entry the job could not retire — it purged
    // its tags from a detached tail, where `revalidateTag` does nothing and says
    // nothing — so the report on disk was not the report on screen.
    await expect(consolePage.reportRow(LAUNCH_REPORT)).toBeVisible();
  },
);

Then('the history shows that job as running', async ({ console: consolePage }) => {
  // Addressed by its start stamp: the label alone is a substring of the
  // `main-2026-08-16__main-2026-08-11` compare two rows below it.
  //
  // Matched against the DRAWN stamp, not the stored one. The table renders an
  // ISO instant as `YYYY-MM-DD HH:MM:SS` (`formatStamp`, in
  // apps/visual-diff-ui/lib/outcome.ts), keeping the whole value on the cell's
  // `title` where `hasText` cannot see it. Derived from the constant above
  // rather than written out again, so the seed and the locator cannot drift —
  // this row's stamp carries no fractional seconds, which is why dropping the
  // `T` and the `Z` is the whole of it.
  const started = INTERRUPTED_RUN.startedAt.replace('T', ' ').replace('Z', '');
  const row = consolePage.historyRows.filter({ hasText: started });

  await expect(consolePage.historyCell(row, 'status')).toHaveText('running');
});

Then(
  'the console shows the running job instead of queueing mine',
  async ({ console: consolePage }) => {
    // User-facing copy per the contract — never the bare 409 code.
    await expect(consolePage.refusalAlert).toContainText('a job is already running');
    await expect(consolePage.currentJob).toContainText(/capture|compare|run|accept/);
  },
);

Then(
  'the deletion is refused because a job is running',
  async ({ console: consolePage }) => {
    // Read where it is spoken: the dialog. The server refuses every mutation
    // while the lock is held, and the confirmation stays open on the sentence
    // rather than closing on a delete that did not happen.
    await expect(consolePage.dialogRefusal).toContainText('a job is already running');
  },
);

Then(
  'the page behind the dialog announces only the running job',
  async ({ console: consolePage }) => {
    // The rule this scenario exists for. Two alerts are on screen and both say
    // the same sentence, because one condition draws both: the run panel
    // announces the lock, and the dialog announces the refusal it caused. Only
    // the first belongs to the page — `Dialog` portals out of `main` — so the
    // landmark-scoped locator every refusal scenario reads stays unambiguous.
    //
    // Counted, not `.first()`ed. The count IS the requirement; taking the first
    // match would make this line pass against exactly the DOM it forbids.
    await expect(consolePage.refusalAlert).toHaveCount(1);
    await expect(consolePage.refusalAlert).toContainText('a job is already running');
  },
);

Then('the deletion is refused naming what holds it', async ({ console: consolePage }) => {
  // The dialog, like every refusal a confirmation draws: this one is spoken
  // inside the delete dialog, which `Dialog` portals out of `main`.
  await expect(consolePage.dialogRefusal).toContainText(/worktree/i);
  await expect(consolePage.dialogRefusal).toContainText(HELD_SET.label);
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
