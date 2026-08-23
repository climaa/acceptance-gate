import * as fs from 'node:fs';
import * as path from 'node:path';

import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { test } from './fixtures';
import type { ConsolePage } from '../../pages/console';

const { Given, When, Then, After } = createBdd(test);

// Reused steps and their home:
//   "I visit my console"  → report.steps.ts
//
// Everything else this flow needs is below, because nothing in the read-only
// half of this lane has any reason to write.

/**
 * The tree the dev server on 3300 reads, as `apps/visual-diff-ui`'s own `dev`
 * script names it: `VISUAL_DIFF_DATA_DIR=../../.visual-diff`, resolved from that
 * workspace. Restated here rather than read from the app, because a step that
 * writes into a directory has to be certain WHICH one before it does.
 *
 * With the variable unset the app falls back to its committed fixtures and
 * badges itself as sample data (`lib/data-dir.ts`), which the Background rules
 * out — so if the console under test is real, this path is what it is reading.
 */
const LOCAL_DATA_DIR = path.join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  '.visual-diff',
);

/** The one-job-at-a-time lock, as `apps/visual-diff-ui/lib/jobs.ts` publishes
 *  it: one file under the data directory, whose `pid` is the whole staleness
 *  test. */
const LOCK_FILE = 'job.lock';

interface HistoryRun {
  mode: string;
  label: string;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  reportId: string | null;
}

const HISTORY_FILE = 'history.json';

/** The set registry the console lists from, as `lib/data.ts` writes it: one
 *  `sets` array, newest first. */
const SETS_FILE = 'sets.json';

/** The lock this lane is holding, or null. Module-scoped rather than carried
 *  through `localState`, so that a scenario which dies before its first step can
 *  still be cleaned up after — the hook below takes no fixtures and so depends
 *  on nothing the scenario built. Safe: this lane runs one worker, so one
 *  process ever writes these. */
let heldLock: string | null = null;

/** Your history file exactly as it was before a scenario made its newest run
 *  look live — the bytes, not a re-serialization, so restoring it cannot
 *  reformat or reorder anything of yours. */
let historyBefore: string | null = null;

/**
 * Where those bytes also go, on disk, for the run that never reaches its hook.
 *
 * Ctrl-C, a crash, or stopping a run in UI Mode between the write and the
 * teardown would otherwise leave your newest real run looking unfinished
 * forever: three nulls the console renders as `interrupted`, with no exit code
 * and no report link, and nothing later repairs it — the next run edits whatever
 * `history[0]` is by then, which is a different row.
 *
 * So the backup outlives the process, and the Background puts it back. A run
 * repairs the one before it.
 */
const HISTORY_BACKUP = 'history.json.e2e-backup';

/**
 * Release it, whatever the scenario came to.
 *
 * Not optional politeness: a lock left behind refuses every delete, every prune
 * and every job this console is asked for afterwards — including the ones a
 * later scenario in this flow makes, and including the ones YOU make from the
 * browser once the run is over. The acceptance lane's equivalent hook lives in
 * its own steps file and is not loaded by this config.
 */
After(() => {
  if (heldLock !== null) {
    fs.rmSync(heldLock, { force: true });
    heldLock = null;
  }

  if (historyBefore !== null) {
    fs.writeFileSync(path.join(LOCAL_DATA_DIR, HISTORY_FILE), historyBefore);
    historyBefore = null;
  }

  fs.rmSync(path.join(LOCAL_DATA_DIR, HISTORY_BACKUP), { force: true });
});

/** Put back whatever an interrupted run left mid-edit, and forget it. Safe to
 *  call when there is nothing to do, which is every run but the one after a
 *  run that died. */
function restoreInterruptedHistory(): void {
  const backup = path.join(LOCAL_DATA_DIR, HISTORY_BACKUP);
  if (!fs.existsSync(backup)) return;

  fs.writeFileSync(path.join(LOCAL_DATA_DIR, HISTORY_FILE), fs.readFileSync(backup));
  fs.rmSync(backup, { force: true });
}

/** The newest run this console has recorded — the row a lock must impersonate
 *  for the history to read as `running`. Read at step time rather than pinned,
 *  because on real data the newest run is whatever the scenario before this one
 *  just launched. */
function newestRun(): HistoryRun {
  const file = path.join(LOCAL_DATA_DIR, HISTORY_FILE);
  const history: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));

  const newest = Array.isArray(history) ? (history as HistoryRun[])[0] : undefined;
  expect(
    newest,
    `${file} records no runs, so there is no job for a lock to impersonate. ` +
      'Run a compare from the console first.',
  ).toBeDefined();

  // Narrowing for the compiler; the expect above is what a reader sees fail.
  if (!newest) throw new Error(`${file} records no runs`);

  return newest;
}

/** The report id the two sets the pickers opened on would produce: `<A>__<B>`,
 *  as `lib/jobs.ts` names it. Read off the console rather than chosen, because
 *  which two those are is a fact about your tree. */
async function pairInThePickers(vd: ConsolePage): Promise<string> {
  const a = (await vd.selectedOption(vd.pickerA).innerText()).trim();
  const b = (await vd.selectedOption(vd.pickerB).innerText()).trim();
  expect(
    a,
    'the two pickers opened on the same set, so this compare says nothing',
  ).not.toBe(b);

  return `${a}__${b}`;
}

/** Every set label the table lists, in listed order — newest first, the order
 *  `sets.json` is written in and the console shows. */
async function listedLabels(vd: ConsolePage): Promise<string[]> {
  await expect(vd.setRows.first()).toBeVisible();

  return (await vd.setLabel(vd.setRows).allInnerTexts())
    .map((label) => label.trim())
    .filter(Boolean);
}

Given('this console is serving my own captures', async ({ console: vd }) => {
  restoreInterruptedHistory();
  await vd.openHere();
  // The precondition is asserted, never skipped — the same rule the read-only
  // half of this lane follows. A machine with nothing captured has a data
  // directory and no sets in it, and a flow that quietly passed there would
  // write nothing and claim it wrote.
  await expect(
    vd.setRows,
    'This flow mutates YOUR captures, and this console lists none. Capture a set ' +
      'first — start a capture from the console, or run `pnpm visual-diff:container capture`.',
  ).not.toHaveCount(0);
  // Sample mode means the app is reading its committed fixtures, not your tree.
  // Writing would be aimed at a directory no scenario here declared.
  await expect(
    vd.sampleBadge,
    'This console is badged as sample data, so it is not reading your .visual-diff tree.',
  ).toHaveCount(0);

  // And the tree it IS reading is the one the steps below write to.
  //
  // `LOCAL_DATA_DIR` is a constant, but `reuseExistingServer: true` means the
  // console under test may be a `pnpm dev` someone started with a different
  // `VISUAL_DIFF_DATA_DIR` — a second checkout, or one aimed at a seeded world.
  // Both checks above pass in that case (it has sets; it is not sample mode)
  // while every write below lands somewhere else. Comparing what the page lists
  // against what is on disk at the path this file writes to is the question
  // those two cannot ask.
  const onScreen = await listedLabels(vd);
  const onDisk = (
    JSON.parse(fs.readFileSync(path.join(LOCAL_DATA_DIR, SETS_FILE), 'utf8')) as {
      sets: { label: string }[];
    }
  ).sets.map((set) => set.label);

  expect(
    [...onScreen].sort(),
    `This console is not reading ${LOCAL_DATA_DIR} — it lists ${onScreen.length} set(s) ` +
      `and that directory holds ${onDisk.length}. A dev server started with a different ` +
      'VISUAL_DIFF_DATA_DIR is being reused; stop it and let this config boot its own.',
  ).toEqual([...onDisk].sort());
});

/**
 * Clear the report the compare below is about to write, if you already have one.
 *
 * Without this, "the console lists that report without a reload" is vacuous on
 * every run after the first: this flow always compares the two NEWEST sets and
 * always retires the two OLDEST, so the pair — and therefore the report id — is
 * the same every time. On the second run the reports panel already holds that
 * row when the page loads, and the assertion passes before the job is launched.
 *
 * The acceptance lane's identical step is sound because its world is re-seeded
 * at every webServer boot. Nothing re-seeds yours, so the state has to be made
 * here. What this removes is exactly what the next two steps regenerate.
 */
Given(
  'no report exists yet for the two sets the pickers offer',
  async ({ console: vd, localState, mayWrite }) => {
    void mayWrite;
    await vd.openHere();
    const id = await pairInThePickers(vd);
    localState.reportId = id;

    fs.rmSync(path.join(LOCAL_DATA_DIR, 'reports', id), {
      recursive: true,
      force: true,
    });
  },
);

When(
  'I launch a comparison of the two sets the pickers offer',
  async ({ console: vd, localState }) => {
    // Whatever the console opens on: newest against second-newest.
    const [a = '', b = ''] = (await pairInThePickers(vd)).split('__');
    expect(`${a}__${b}`, 'the pickers moved between the Given and this step').toBe(
      localState.reportId,
    );

    await vd.chooseCompare(a, b);
    await vd.startButton.click();
  },
);

Then("the live log runs to the job's end", async ({ console: vd }) => {
  await expect(vd.liveLog).toBeVisible();
  // Milestone, not growth: a fast job can finish between two reads, so the
  // assertion is the terminal line the contract pins, with time for a real run.
  // A real corpus is bigger than the seeded worlds', so this is the one timeout
  // in the lane that is generous on purpose.
  await expect(vd.liveLog).toContainText(/exit \d/, { timeout: 120_000 });
});

Then('the finished job links to its report', async ({ console: vd }) => {
  await expect(vd.viewReportLink).toBeVisible({ timeout: 120_000 });
});

Then(
  'the console lists that report without a reload',
  async ({ console: vd, localState }) => {
    // Never reloaded: this page has been open since before the job was launched,
    // and the only thing that re-read the server since is the poller's own
    // `router.refresh()`, fired once when it saw the job finish.
    //
    // Non-vacuous because the Given removed this report before the page was
    // opened: the row cannot have been drawn by the load. The id is not knowable
    // in a `.feature`, so it is read from the finished job's own link and checked
    // against the pair the Given cleared.
    const href = await vd.viewReportLink.getAttribute('href');
    expect(href, 'the finished job links nowhere').toBeTruthy();
    const id = (href ?? '').replace(/^\/report\//, '');

    expect(id, 'the job that finished is not the compare this scenario launched').toBe(
      localState.reportId,
    );
    await expect(vd.reportRow(id)).toBeVisible();
  },
);

/**
 * Make the newest run look live, and take its lock.
 *
 * A lock alone is not enough, and that is a fact about the data rather than
 * about this step: `lib/jobs.ts` reads a run as running only when the row is
 * unfinished — `endedAt`, `exitCode` and `reportId` all null, which is what
 * `startJob` writes and only the end of the job patches. Your newest run
 * finished, so with a lock on top the console correctly still reads it as
 * `succeeded`. Those three nulls plus the lock ARE the on-disk state of a live
 * job; nothing here fakes a screen.
 *
 * The row is restored byte-for-byte by the `After` hook above — this is the one
 * write in the flow that is not yours to keep.
 */
Given('my newest run is holding the job lock', async ({ console: vd, mayWrite }) => {
  void mayWrite;
  const file = path.join(LOCAL_DATA_DIR, HISTORY_FILE);
  const before = fs.readFileSync(file, 'utf8');
  const history = JSON.parse(before) as HistoryRun[];
  const run = newestRun();

  historyBefore = before;
  fs.writeFileSync(path.join(LOCAL_DATA_DIR, HISTORY_BACKUP), before);
  history[0] = { ...run, endedAt: null, exitCode: null, reportId: null };
  fs.writeFileSync(file, `${JSON.stringify(history, null, 2)}\n`);

  const lock = path.join(LOCAL_DATA_DIR, LOCK_FILE);
  try {
    // `wx`, so a lock a real job of yours is holding is an error here rather
    // than something this quietly overwrites.
    fs.writeFileSync(
      lock,
      `${JSON.stringify({ pid: process.pid, mode: run.mode, label: run.label, startedAt: run.startedAt })}\n`,
      { flag: 'wx' },
    );
  } catch (err) {
    const reason =
      (err as NodeJS.ErrnoException).code === 'EEXIST'
        ? `${lock} already exists — a job of yours is still running, or one was killed and ` +
          'left its lock behind. Wait for it, or remove that file.'
        : String(err);
    throw new Error(reason);
  }
  heldLock = lock;

  await vd.openHere();
});

When('I try to start another job', async ({ console: vd }) => {
  await vd.selectJobMode('compare');
  // D1, as the run panel implements it: while the lock is held there is no start
  // control to press. Reaching for it IS the attempt, and what stands in its
  // place is the answer the Then reads.
  await expect(vd.startButton).toHaveCount(0);
});

Then(
  'the console shows the running job instead of queueing mine',
  async ({ console: vd }) => {
    // User-facing copy per the contract — never the bare 409 code.
    await expect(vd.refusalAlert).toContainText('a job is already running');
    await expect(vd.currentJob).toContainText(/capture|compare|run|accept/);
  },
);

Then('the history shows that job as running', async ({ console: vd }) => {
  // Matched against the DRAWN stamp, not the stored one: the table renders an
  // ISO instant as `YYYY-MM-DD HH:MM:SS` (`formatStamp`, in
  // apps/visual-diff-ui/lib/outcome.ts). A real run's `startedAt` carries
  // fractional seconds that the cell does not print, so they are cut here rather
  // than searched for.
  const started = newestRun().startedAt.slice(0, 19).replace('T', ' ');
  const row = vd.historyRows.filter({ hasText: started });

  await expect(vd.historyCell(row, 'status')).toHaveText('running');
});

When('I delete my oldest set', async ({ console: vd, localState }) => {
  const labels = await listedLabels(vd);
  const oldest = labels[labels.length - 1];
  expect(oldest, 'this console lists no sets to delete').toBeTruthy();
  if (!oldest) return;

  localState.deletedSet = oldest;
  await vd.deleteSet(oldest);

  // A held set is refused, and the console says so inside the dialog it refused
  // in. Whether anything holds your oldest set is a fact about your machine —
  // the kind this lane may not assume — so it is read back rather than assumed,
  // and the reader gets the reason instead of "expected 0, received 1" two steps
  // later. Scenarios that EXPECT a refusal assert it themselves before this
  // matters.
  const refusals = await vd.dialogRefusal.allInnerTexts();
  const held = refusals.find((text) => /worktree/i.test(text));
  expect(
    held,
    `"${oldest}" cannot be deleted: ${held ?? ''}. This flow retires your oldest set, ` +
      'and a registered worktree is holding that one.',
  ).toBeUndefined();
});

Then('the deletion is refused because a job is running', async ({ console: vd }) => {
  // Read where it is spoken: the dialog. The server refuses every mutation while
  // the lock is held, and the confirmation stays open on the sentence rather
  // than closing on a delete that did not happen.
  await expect(vd.dialogRefusal).toContainText('a job is already running');
});

Then(
  'the page behind the dialog announces only the running job',
  async ({ console: vd }) => {
    // Two alerts are on screen and both say the same sentence, because one
    // condition draws both. Only the first belongs to the page — `Dialog` portals
    // out of `main` — so the landmark-scoped locator stays unambiguous. Counted,
    // not `.first()`ed: the count IS the requirement.
    await expect(vd.refusalAlert).toHaveCount(1);
    await expect(vd.refusalAlert).toContainText('a job is already running');
  },
);

Then('that set is no longer listed', async ({ console: vd, localState }) => {
  const deleted = localState.deletedSet;
  expect(deleted, 'no delete step ran before this assertion').toBeDefined();
  if (deleted === undefined) return;

  // Named, not inferred: re-reading the table and observing it still has a last
  // row would agree with itself whether or not anything was deleted.
  await expect(vd.setRow(deleted)).toHaveCount(0);
});

When('I prune keeping every set but the oldest', async ({ console: vd, localState }) => {
  const labels = await listedLabels(vd);
  expect(
    labels.length,
    'a prune that keeps every set retires nothing, so this scenario needs at least two.',
  ).toBeGreaterThan(1);

  localState.setLabels = labels;
  await vd.pruneKeeping(String(labels.length - 1));
});

Then('only the sets inside that window remain', async ({ console: vd, localState }) => {
  const before = localState.setLabels;
  expect(before, 'no prune step ran before this assertion').toBeDefined();
  if (!before) return;

  const oldest = before[before.length - 1];
  // Never `?? ''` into a selector: `exactly('')` is /^$/, which would make the
  // count assertion below pass for a reason that has nothing to do with pruning.
  expect(oldest, 'the prune step recorded no sets').toBeDefined();
  if (oldest === undefined) return;

  await expect(vd.setRows).toHaveCount(before.length - 1);
  await expect(vd.setRow(oldest)).toHaveCount(0);
});
