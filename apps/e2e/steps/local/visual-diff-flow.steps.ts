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

/** What `accept` promotes into — `lib/jobs.ts`'s layout comment. It has no
 *  screen, which is why removing it is the one filesystem write in this file. */
const PROMOTED_DIR = '__baselines__';

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
 * the whole corpus inside the pinned container. A promote copies bytes already on
 * disk, so its only slow part is `docker run` — seconds warm, minutes on a cold
 * image pull.
 *
 * Both must fit inside `playwright.local.config.ts`'s test timeout, which is the
 * budget for the WHOLE scenario now that the lane is one test. 20 + 5 under 30.
 */
const JOB_TIMEOUT = 20 * 60_000;
const PROMOTE_TIMEOUT = 5 * 60_000;

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

const promotedDir = () => path.join(LOCAL_DATA_DIR, PROMOTED_DIR);

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

    fs.rmSync(promotedDir(), { recursive: true, force: true });
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
 * Mark every section the report drew, one click each.
 *
 * A section checkbox is handed `section.variantKeys` — every variant of that
 * section, not the cards currently on screen — so this is a whole-report pass
 * however the results happen to be filtered or collapsed.
 *
 * Counted off the page rather than listed: an empty tier is not rendered at all,
 * and the accessibility section appears only when a run found violations.
 */
async function markEverySection(report: ReportPage) {
  await expect(
    report.storyCards.first(),
    'this report drew no story cards, so there is nothing to read through',
  ).toBeVisible();

  const sections = report.resultSections;
  const drawn = await sections.count();
  expect(drawn, 'this report drew no sections to read through').toBeGreaterThan(0);

  for (let index = 0; index < drawn; index += 1) {
    await report.sectionCheckbox(sections.nth(index)).check();
  }
}

/** The report the newest finished job wrote, read off its own link — the lane's
 *  way of learning an id without naming one. */
async function reportIdFromJob(vd: ConsolePage): Promise<string> {
  await expect(vd.viewReportLink).toBeVisible({ timeout: JOB_TIMEOUT });

  const href = await vd.viewReportLink.getAttribute('href');
  expect(href, 'the finished job links nowhere').toBeTruthy();

  return (href ?? '').replace(/^\/report\//, '');
}

/** Leave the report and arm the accept tab for it. Both accept steps do this,
 *  and what differs is only what they assert afterwards. */
async function armAccept(vd: ConsolePage, report: ReportPage, reportId: string) {
  await report.backToConsole.click();
  await vd.selectJobMode('accept');
  await vd.chooseAcceptReport(reportId);
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
  await expect(vd.currentJob).toContainText(/capture|compare|accept/);

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
    // keeps the last finished run on screen forever, that run's log ends in
    // `exit 0`, and a previous accept's label is `baselines__<set>` — which
    // CONTAINS this set's label. A `toContainText` guard would match the old job
    // and the terminal line would pass before this capture had started.
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
  await markEverySection(report);

  await expect(report.uncheckedCards()).toHaveCount(0);
  // Not vacuous: a report with no cards would satisfy the line above on its own.
  await expect(report.checkedCards()).not.toHaveCount(0);
  // The pinned `reviewed N/M` format, asserted as N === M through a backreference
  // rather than against a number this lane may not know. Anchored at both ends:
  // `toHaveText` does not anchor a RegExp for you.
  await expect(report.reviewProgress).toHaveText(/^reviewed (\d+)\/\1$/);
});

Then('the console offers to accept it', async ({ console: vd, report, localState }) => {
  await armAccept(vd, report, localState.reportId ?? '');

  await expect(
    vd.acceptGateNote,
    'the gate still counts unread variants, so the marks made next door did not reach it',
  ).toHaveCount(0);
  await expect(vd.startButton).toBeEnabled();
});

When('I accept it', async ({ console: vd }) => {
  await expect(
    vd.dockerRequiredNote,
    'a promote runs in the pinned container and Docker is not running',
  ).toHaveCount(0);

  await vd.startButton.click();
  await expect(
    vd.refusalAlert,
    'the console refused this accept — its own reason is in the run panel',
  ).toHaveCount(0);
});

Then('the promotion runs to its end', async ({ console: vd }) => {
  await expect(vd.liveLog).toBeVisible();
  await expect(vd.liveLog).toContainText(/promoted \d+ baseline\(s\)/, {
    timeout: PROMOTE_TIMEOUT,
  });
  // `exit 0` and not `exit \d`, unlike the two jobs above: a promote that failed
  // wrote nothing, and there is no partial success worth passing this step on.
  await expect(vd.liveLog).toContainText(/exit 0/, { timeout: PROMOTE_TIMEOUT });
});

Then(
  'the history records the accept as succeeded',
  async ({ console: vd, localState }) => {
    // Identity first, and NOT from the history table: its columns are status,
    // type, started, exit and took — there is no label column, so a row cannot be
    // matched on the report id at all. The label of an accept IS its report id,
    // and the current-job region is the one place a label is drawn.
    await expect(vd.currentJob).toContainText(localState.reportId ?? '');

    // Then the row, which is the newest accept — history is newest first, and
    // nothing else has run since this scenario's promote.
    const row = vd.historyRow(/accept/).first();

    await expect(vd.historyCell(row, 'type')).toHaveText('accept');
    await expect(vd.historyCell(row, 'status')).toHaveText('succeeded');
    await expect(vd.historyCell(row, 'exit')).toHaveText('0');
  },
);

/**
 * Make the newest run look live, and take its lock.
 *
 * Still fabricated, where D1 above is not, and the difference is what each needs.
 * D1 needs a running job; a real capture supplies one. This needs a running job
 * AND something deletable — and until the capture finished there was nothing to
 * delete, by which time the job was over. So the lock is made rather than waited
 * for, which is also what makes the refusal deterministic.
 *
 * A lock alone is not enough: `lib/jobs.ts` reads a run as running only when the
 * row is unfinished — `endedAt`, `exitCode` and `reportId` all null, which is
 * what `startJob` writes and only the end of the job patches. Those three nulls
 * plus the lock ARE the on-disk state of a live job; nothing here fakes a screen.
 *
 * The row is restored byte-for-byte when the lock is released.
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
 * Take back all three things this scenario made, through the console wherever
 * the console has a way.
 *
 * The reports and the set go through the same confirmation dialogs a reviewer
 * answers, because "the console can remove what it wrote" is part of what this
 * scenario is for. The promotion has no screen at all — `accept` writes into
 * `<dataDir>/__baselines__` and nothing in the app reads it back — so that one is
 * the single filesystem write here, and why this step declares `mayWrite`.
 *
 * The committed corpus at `packages/visual-diff/__baselines__` is never touched.
 * It is a different directory, it is what CI compares against, and nothing in
 * this lane has any business near it.
 */
When(
  'I remove the set, the report and the promotion',
  async ({ console: vd, localState, mayWrite }) => {
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
    await expect(vd.reportRow(reportId)).toHaveCount(0);

    await vd.deleteSet(label);
    await expect(vd.setRow(label)).toHaveCount(0);

    fs.rmSync(promotedDir(), { recursive: true, force: true });
    madeLabel = null;
    madeReportId = null;
  },
);

Then('the console holds nothing this run made', async ({ console: vd, localState }) => {
  // Its own three, named — deliberately NOT "the console is empty".
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

  expect(
    fs.existsSync(promotedDir()),
    'the promotion this scenario wrote is still on disk',
  ).toBe(false);
});
