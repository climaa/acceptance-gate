import * as fs from 'node:fs';
import * as path from 'node:path';

import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { test } from './fixtures';
import type { ConsolePage } from '../../pages/console';
import type { ReportPage } from '../../pages/report';

const { Given, When, Then, After } = createBdd(test);

/**
 * The whole local lane, in one file, for one scenario.
 *
 * It was two files and nine scenarios until 2026-08-24. They were collapsed
 * because the lane consumed capture sets and never made one, so it could only run
 * on a machine somebody had captured on by hand — and the console it is supposed
 * to vouch for is at its least tested precisely when it has captured nothing.
 * This scenario makes its own input and takes it away again.
 *
 * `EXPECTED_LOCAL_SCENARIOS` in `scripts/local-integrity.mjs` carries the
 * decision and what it cost.
 */

/**
 * The tree the dev server on 3300 reads, as `apps/visual-diff-ui`'s own `dev`
 * script names it: `VISUAL_DIFF_DATA_DIR=../../.visual-diff`, resolved from that
 * workspace. Restated here rather than read from the app, because a step that
 * writes into a directory has to be certain WHICH one before it does.
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

const HISTORY_FILE = 'history.json';

/** The set registry the console lists from, as `lib/data.ts` writes it. */
const SETS_FILE = 'sets.json';

interface HistoryRun {
  mode: string;
  label: string;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  reportId: string | null;
}

/** The shape `SetLabelSchema` accepts, restated because this suite drives the
 *  console through a browser and shares no module graph with it. */
const SET_LABEL = /^[A-Za-z0-9][A-Za-z0-9.-]*$/;

/**
 * How long a job may take before a step gives up.
 *
 * A capture is minutes: `runCheck` rebuilds Storybook every run and then shoots
 * the whole corpus inside the pinned container.
 *
 * It must fit inside `playwright.local.config.ts`'s test timeout, which is the
 * budget for the WHOLE scenario now that the lane is one test.
 */
const JOB_TIMEOUT = 20 * 60_000;

/** The lock this lane is holding, or null. Module-scoped rather than carried
 *  through `localState`, so a scenario that dies before its first step can still
 *  be cleaned up after — the hook below takes no fixtures and so depends on
 *  nothing the scenario built. */
let heldLock: string | null = null;

/** Your history file exactly as it was before the scenario made its newest run
 *  look live — the bytes, not a re-serialization. */
let historyBefore: string | null = null;

/** The set this run captured and the report it wrote, so the hook can remove
 *  them without the fixtures a step would have used. Null once nothing is owed.
 *
 *  Its OWN artifacts, named — never "every set" or "every report". This lane
 *  runs against a tree that may hold work of yours, and a teardown that swept
 *  the panels clean would take that with it. */
let madeLabel: string | null = null;
let madeReportId: string | null = null;

/**
 * Where those bytes also go, on disk, for the run that never reaches its hook.
 *
 * Ctrl-C, a crash, or stopping a run in UI Mode between the write and the
 * teardown would otherwise leave your newest real run looking unfinished
 * forever: three nulls the console renders as `interrupted`, with no exit code
 * and no report link, and nothing later repairs it.
 */
const HISTORY_BACKUP = 'history.json.e2e-backup';

/**
 * Give back the lock and the history row, whatever the scenario came to.
 *
 * A step calls this when the refusal it fabricated the lock for has been read;
 * the hook calls it again for the run that never got that far. Both paths are
 * the same three writes, so they are one function — a lock left behind refuses
 * every job this console is asked for afterwards, including the ones YOU make
 * from the browser once the run is over.
 */
function releaseHeldLock(): void {
  if (heldLock !== null) {
    fs.rmSync(heldLock, { force: true });
    heldLock = null;
  }

  if (historyBefore !== null) {
    fs.writeFileSync(path.join(LOCAL_DATA_DIR, HISTORY_FILE), historyBefore);
    historyBefore = null;
  }

  fs.rmSync(path.join(LOCAL_DATA_DIR, HISTORY_BACKUP), { force: true });
}

/**
 * Teardown, twice over — and the second one is why this lane can be trusted to
 * start cold.
 *
 * The scenario removes what it made through the console's own dialogs, because
 * "the console can take back what it wrote" is part of what is being asserted.
 * But a step only runs if every step before it passed, and one long scenario
 * fails in the middle far more often than five short ones do. So the hook repeats
 * the removal for the run that went red, reaching past the UI to the filesystem
 * because there may be no working console left to click.
 *
 * Without it, one red run leaves a capture behind and the next run starts warm —
 * exactly the property this rewrite exists to guarantee.
 */
After(() => {
  releaseHeldLock();

  if (madeLabel !== null) {
    fs.rmSync(path.join(LOCAL_DATA_DIR, 'sets', madeLabel), {
      recursive: true,
      force: true,
    });

    // The registry too: a shot tree removed without its row leaves the console
    // listing a set whose directory is gone, which is worse than either.
    const file = path.join(LOCAL_DATA_DIR, SETS_FILE);
    if (fs.existsSync(file)) {
      const registry = JSON.parse(fs.readFileSync(file, 'utf8')) as {
        sets: { label: string }[];
      };
      fs.writeFileSync(
        file,
        `${JSON.stringify(
          { ...registry, sets: registry.sets.filter((s) => s.label !== madeLabel) },
          null,
          2,
        )}\n`,
      );
    }

    if (madeReportId !== null) {
      fs.rmSync(path.join(LOCAL_DATA_DIR, 'reports', madeReportId), {
        recursive: true,
        force: true,
      });
      madeReportId = null;
    }

    madeLabel = null;
  }
});

/** Put back whatever an interrupted run left mid-edit, and forget it. */
function restoreInterruptedHistory(): void {
  const backup = path.join(LOCAL_DATA_DIR, HISTORY_BACKUP);
  if (!fs.existsSync(backup)) return;

  fs.writeFileSync(path.join(LOCAL_DATA_DIR, HISTORY_FILE), fs.readFileSync(backup));
  fs.rmSync(backup, { force: true });
}

/** The newest run this console has recorded — the row a lock must impersonate
 *  for the history to read as `running`. */
function newestRun(): HistoryRun {
  const file = path.join(LOCAL_DATA_DIR, HISTORY_FILE);
  const history: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));

  const newest = Array.isArray(history) ? (history as HistoryRun[])[0] : undefined;
  expect(
    newest,
    `${file} records no runs, so there is no job for a lock to impersonate.`,
  ).toBeDefined();

  if (!newest) throw new Error(`${file} records no runs`);

  return newest;
}

/** Every set label the table lists, in listed order — newest first. */
async function listedLabels(vd: ConsolePage): Promise<string[]> {
  return (await vd.setLabel(vd.setRows).allInnerTexts())
    .map((label) => label.trim())
    .filter(Boolean);
}

/**
 * Mark every section the report drew, one click each, and answer how many that
 * was.
 *
 * A section checkbox is handed `section.variantKeys` — every variant of that
 * section, not the cards currently on screen — so this is a whole-report pass
 * however the results happen to be filtered or collapsed.
 *
 * Counted off the page rather than listed: an empty tier is not rendered at all,
 * and the accessibility section appears only when a run found violations.
 *
 * **Zero is an answer, not a failure.** This used to open by demanding a story
 * card, and that demand was wrong: the scenario captures the corpus and compares
 * it against the corpus, so on a branch that moved no pixels every variant
 * matches and the report draws no rows at all. The feature asks for "whichever
 * ones the report drew", which admits none. The caller decides what to assert
 * about each case; this one only reports what it found.
 *
 * The progress figure is the settle point the card assertion used to be by
 * accident. It is drawn either way — `reviewed 0/0` on a clean run — so waiting
 * for it means a count of zero is the report's answer rather than a race with
 * its first paint.
 */
async function markEverySection(report: ReportPage): Promise<number> {
  await expect(report.reviewProgress).toBeVisible();

  const sections = report.resultSections;
  const drawn = await sections.count();

  for (let index = 0; index < drawn; index += 1) {
    await report.sectionCheckbox(sections.nth(index)).check();
  }

  return drawn;
}

/** The report the newest finished job wrote, read off its own link — the lane's
 *  way of learning an id without naming one. */
async function reportIdFromJob(vd: ConsolePage): Promise<string> {
  await expect(vd.viewReportLink).toBeVisible({ timeout: JOB_TIMEOUT });

  const href = await vd.viewReportLink.getAttribute('href');
  expect(href, 'the finished job links nowhere').toBeTruthy();

  return (href ?? '').replace(/^\/report\//, '');
}

/**
 * The console, and the two things worth asserting about it before anything is
 * written.
 *
 * It no longer demands existing captures. That precondition is what made the
 * lane unrunnable on the machine it exists to vouch for; the scenario supplies
 * its own set now.
 *
 * The identity check — is this console reading the tree this file writes to? —
 * cannot live here any more either. `reuseExistingServer: true` means the console
 * answering on 3300 may be a `pnpm dev` someone started against a different
 * `VISUAL_DIFF_DATA_DIR`, and comparing what the page lists against what is on
 * disk is the only question that catches it. On an empty console that comparison
 * is `[] === []` and proves nothing, so it moves to the first moment it can bite:
 * just after the capture, where it names a label this run created.
 */
Given('this console is serving my own data', async ({ console: vd }) => {
  restoreInterruptedHistory();
  await vd.openHere();

  // Sample mode means the app is reading its committed fixtures, not your tree.
  // Writing would be aimed at a directory no step here declared. Meaningful on
  // an empty console, which is why this one stays.
  await expect(
    vd.sampleBadge,
    'This console is badged as sample data, so it is not reading your .visual-diff tree.',
  ).toHaveCount(0);

  // The panel, not the table: a console that has captured nothing renders an
  // empty state where the table goes, and this lane's whole point is starting
  // there.
  await expect(vd.setsPanel).toBeVisible();
});

When('I ask the console to name a capture set', async ({ console: vd, localState }) => {
  await vd.selectJobMode('capture');
  await vd.labelWand.click();

  const field = vd.runField('label');
  await expect(
    field,
    'the wand named nothing — this checkout has no branch a label can be built from',
  ).toHaveValue(SET_LABEL);

  localState.capturedLabel = await field.inputValue();
});

When('I start a capture under that name', async ({ console: vd, localState }) => {
  const label = localState.capturedLabel ?? '';
  expect(label, 'no step named a set before this one tried to capture it').toBeTruthy();

  // Docker is asked about before the click rather than after it. Off the pinned
  // image a capture borrows the container, and with no daemon the button is
  // disabled — which would fail this step on a greyed control and say nothing
  // about the loop it is here to test.
  await expect(
    vd.dockerRequiredNote,
    'this capture needs the pinned container and Docker is not running — start Docker and run this again',
  ).toHaveCount(0);

  await vd.startButton.click();
  await expect(
    vd.refusalAlert,
    'the console refused to start this capture — its own reason is in the run panel',
  ).toHaveCount(0);

  // Owed from here, so the hook can take it back even if nothing below runs.
  madeLabel = label;
});

/**
 * D1, against a job that is genuinely running.
 *
 * The lane used to fabricate a lock for this, and had to: a compare over shot
 * trees that already exist is over in about a second, which is no window to
 * assert in. A capture runs for minutes, so the console is really busy here and
 * the refusal is the one the server would answer a second start with.
 */
Then('a second job is refused while that one runs', async ({ console: vd }) => {
  await vd.selectJobMode('compare');

  // While the lock is held there is no start control to press. Reaching for it
  // IS the attempt, and what stands in its place is the answer.
  await expect(vd.startButton).toHaveCount(0);
  await expect(vd.refusalAlert).toContainText('a job is already running');
  await expect(vd.currentJob).toContainText(/capture|compare/);

  // Back to the tab the capture was started from, so what follows reads the
  // panel it left rather than one this assertion moved.
  await vd.selectJobMode('capture');
});

Then(
  'the capture finishes and the set is listed',
  async ({ console: vd, localState }) => {
    const label = localState.capturedLabel ?? '';

    await expect(vd.liveLog).toBeVisible();

    // The line only THIS capture writes, waited for before the terminal one.
    //
    // Naming the current-job region is not enough to tell the jobs apart: it
    // keeps the last finished run on screen forever, and that run's log ends in
    // `exit 0`. A `toContainText` guard on the terminal line alone would match
    // the old job and pass before this capture had started.
    await expect(vd.liveLog).toContainText(`capturing into sets/${label}`, {
      timeout: JOB_TIMEOUT,
    });
    // Milestone, not growth: a job can finish between two reads. `exit \d`
    // rather than `exit 0` because a capture that found differences exits 1, and
    // finding differences is the ordinary outcome of one worth comparing.
    await expect(vd.liveLog).toContainText(/exit \d/, { timeout: JOB_TIMEOUT });

    await expect(vd.setRow(label)).toBeVisible();

    // And now the identity check, which could not run before this point.
    //
    // Both cheaper checks pass on a console pointed somewhere else — it is not
    // sample mode, and it now lists a set — while every write lands in another
    // tree. Comparing the page against `sets.json` at the path this file writes
    // to is the question they cannot ask, and it is non-vacuous here because the
    // label just captured has to appear on both sides.
    const onScreen = await listedLabels(vd);
    const onDisk = (
      JSON.parse(fs.readFileSync(path.join(LOCAL_DATA_DIR, SETS_FILE), 'utf8')) as {
        sets: { label: string }[];
      }
    ).sets.map((set) => set.label);

    expect(
      onDisk,
      `This console is not reading ${LOCAL_DATA_DIR} — it lists ${onScreen.length} set(s) ` +
        `and that directory holds ${onDisk.length}. A dev server started with a different ` +
        'VISUAL_DIFF_DATA_DIR is being reused; stop it and let this config boot its own.',
    ).toContain(label);
    expect([...onScreen].sort()).toEqual([...onDisk].sort());
  },
);

/**
 * Compare the capture against the committed corpus.
 *
 * Both sides are picked by position, which names nothing:
 * `DashboardTemplate` puts the corpus at the head of the list ahead of every
 * capture, and the captures follow it newest first — so index 0 is the corpus
 * and index 1 is what this scenario just wrote.
 */
When('I compare that capture against the corpus', async ({ console: vd, localState }) => {
  await expect(
    vd.setRows,
    'this console lists no captures to compare against the corpus',
  ).not.toHaveCount(0);

  await vd.pickerA.selectOption({ index: 0 });
  await vd.pickerB.selectOption({ index: 1 });

  const corpus = (await vd.selectedOption(vd.pickerA).innerText()).trim();
  const captured = (await vd.selectedOption(vd.pickerB).innerText()).trim();
  expect(
    corpus,
    'both pickers opened on the same set, so this compare says nothing',
  ).not.toBe(captured);
  expect(captured, 'the second picker is not the set this run captured').toBe(
    localState.capturedLabel,
  );

  localState.reportId = `${corpus}__${captured}`;

  await vd.compareButton.click();

  // Wait for the panel to actually BE on the compare tab before pressing start.
  //
  // `compare A ⇄ B` writes `?a=&b=&mode=compare` and the run panel reads it back
  // — asynchronously. Press too early and `startButton` is still the capture
  // tab's, still holding the label the wand filled in, and the click starts a
  // SECOND capture instead of the comparison. Not theoretical: it is what this
  // step did on its first real run, and the only trace was a capture set with a
  // `-2` suffix nobody asked for.
  await expect(vd.startButton).toHaveText('start compare');

  await vd.startButton.click();
  await expect(
    vd.refusalAlert,
    'the console refused this compare — its own reason is in the run panel',
  ).toHaveCount(0);
});

Then('the comparison writes a report', async ({ console: vd, localState }) => {
  await expect(vd.liveLog).toBeVisible();
  await expect(vd.liveLog).toContainText(/exit \d/, { timeout: JOB_TIMEOUT });

  // The id the finished job links to, checked against the pair the pickers were
  // left on — which makes this a claim about the comparison this scenario asked
  // for rather than about whatever happened to run last.
  const written = await reportIdFromJob(vd);
  expect(written, 'the job that finished is not the pair the pickers named').toBe(
    localState.reportId,
  );

  await expect(vd.reportRow(written)).toBeVisible();

  // Owed from here, so the hook can take it back even if nothing below runs.
  madeReportId = written;
});

When('I read the whole report through', async ({ console: vd, report, localState }) => {
  await vd.openHere();
  localState.reportId = await reportIdFromJob(vd);

  await report.openHere(localState.reportId);
  const drawn = await markEverySection(report);

  if (drawn === 0) {
    // A clean run: nothing to read through, and the report says exactly that
    // rather than drawing an empty list. Asserted rather than skipped — the
    // verdict is the thing being read here.
    await expect(report.nothingMoved).toBeVisible();
  } else {
    await expect(report.uncheckedCards()).toHaveCount(0);
    // Not vacuous: a report with no cards would satisfy the line above on its
    // own, which is why it is inside the branch that knows there are some.
    await expect(report.checkedCards()).not.toHaveCount(0);
  }
});

/** The pinned `reviewed N/M` format, asserted as N === M through a backreference
 *  rather than against a number this lane may not know. Anchored at both ends:
 *  `toHaveText` does not anchor a RegExp for you. True of both branches — a clean
 *  run reads `reviewed 0/0`.
 *
 *  Its own step now, and the read-through's payoff. It used to be the last line
 *  of the step above, because what came next was the accept gate opening — the
 *  console's one consequence of having read a report. That gate is gone (the
 *  console's accept wrote a corpus nothing read), so the marks are the outcome
 *  this scenario asserts rather than a precondition for the next one. */
Then('every variant of it is marked reviewed', async ({ report }) => {
  await expect(report.reviewProgress).toHaveText(/^reviewed (\d+)\/\1$/);
});

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

When('I try to delete the set it captured', async ({ console: vd, localState }) => {
  const label = localState.capturedLabel ?? '';
  expect(label, 'no step captured a set for this one to delete').toBeTruthy();

  await vd.deleteSet(label);
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

When('the lock is released', async ({ console: vd, mayWrite }) => {
  void mayWrite;
  releaseHeldLock();
  await vd.openHere();
});

/**
 * Take back both things this scenario made, through the console's own dialogs.
 *
 * They go through the same confirmations a reviewer answers, because "the
 * console can remove what it wrote" is part of what this scenario is for. There
 * is no third artifact any more: this lane used to promote a corpus into
 * `<dataDir>/__baselines__`, which had no screen and had to be unlinked by hand,
 * and the console's accept is gone with it.
 *
 * The committed corpus at `packages/visual-diff/__baselines__` is never touched.
 * It is a different directory, it is what CI compares against, and nothing in
 * this lane has any business near it.
 */
When('I remove the set and the report', async ({ console: vd, localState, mayWrite }) => {
  void mayWrite;
  await vd.openHere();

  const reportId = localState.reportId ?? '';
  const label = localState.capturedLabel ?? '';

  // Its own report, by id — not every row in the table.
  //
  // The table is streamed: the panels live inside a `Suspense` boundary, so
  // `goto` resolves on the shell and the rows arrive after it. Waiting for the
  // row is what makes the click land at all, and `count()` would not have
  // retried.
  await expect(vd.reportRow(reportId)).toBeVisible();
  await vd.deleteReport(reportId);
  await vd.deleteSet(label);

  // Then ask the server again, instead of trusting the panel.
  //
  // The console can go on rendering a row it has already deleted.
  // `useMutation` fires `router.refresh()` when the DELETE returns, and
  // `CurrentJob` fires one of its own the first time it sees a job finish —
  // and this teardown runs seconds after the compare ended, so the two overlap.
  // If the poller's refresh, which read the reports BEFORE the delete, lands
  // last, the deleted row is painted back. The poller then goes idle (once per
  // job id, backing off to `MAX_IDLE_POLL_MS`), so nothing ever repaints it
  // away and the stale row simply stays.
  //
  // A longer wait would not have helped: there is no later refresh coming.
  // That race is the console's and is filed separately; what this step owes is
  // that the artifacts are GONE, which is a question for the server.
  await vd.openHere();

  madeLabel = null;
  madeReportId = null;
});

Then('the console holds nothing this run made', async ({ console: vd, localState }) => {
  // Its own two, named — deliberately NOT "the console is empty".
  //
  // The teardown removes what this scenario made and nothing else, so an
  // assertion that the panels are empty is stronger than the promise behind it:
  // it holds only on a tree that started empty, and fails at the very last step
  // on a console that had a capture of yours on it. That is how this step first
  // failed — the set left on screen belonged to another run entirely.
  //
  // Named also makes it non-vacuous: an empty panel satisfies "no rows" whether
  // or not anything was ever removed.
  await expect(vd.setRow(localState.capturedLabel ?? '')).toHaveCount(0);
  await expect(vd.reportRow(localState.reportId ?? '')).toHaveCount(0);
});
