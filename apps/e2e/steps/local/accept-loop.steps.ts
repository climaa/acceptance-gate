import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import type { ConsolePage } from '../../pages/console';
import type { ReportPage } from '../../pages/report';
import { test } from './fixtures';

const { Given, When, Then } = createBdd(test);

/**
 * The loop the console exists for, end to end and against your own tree: name a
 * set, capture it, read the report through, promote it.
 *
 * A second steps file rather than more of `visual-diff-flow.steps.ts`, because
 * playwright-bdd resolves step text across the whole lane — both files' steps
 * are reachable from either feature, so the Background below is that file's,
 * unchanged. What must not collide is the text: every step declared here is
 * phrased so it cannot be mistaken for one of the flow's.
 *
 * Nothing is named. The label is whatever the console suggested, the report is
 * whatever the run wrote, and the sections are whichever ones it drew — read off
 * the page rather than listed here, so a tier added to policy is a tier this
 * flow reviews without being told.
 */

/** The shape `SetLabelSchema` accepts, restated because this suite drives the
 *  console through a browser and shares no module graph with it. */
const SET_LABEL = /^[A-Za-z0-9][A-Za-z0-9.-]*$/;

/**
 * How long a job may take before the step gives up.
 *
 * A capture is minutes: `runCheck` rebuilds Storybook every run and then shoots
 * the whole corpus inside the pinned container. The flow next door allows
 * 120 s for a compare over shot trees that already exist; this is the same
 * assertion with the budget a real capture needs, and the reason
 * `test:local:accept` passes `--timeout` — the per-test ceiling is 30 s and the
 * integrity guard refuses `@timeout:`.
 */
const JOB_TIMEOUT = 20 * 60_000;

/** A promote copies bytes already on disk, so the only slow part is `docker
 *  run` — seconds warm, minutes on a cold image pull. */
const PROMOTE_TIMEOUT = 5 * 60_000;

/**
 * Mark every section the report drew, one click each.
 *
 * A section checkbox is handed `section.variantKeys` — every variant of that
 * section, not the cards currently on screen — so this is a whole-report pass
 * however the results happen to be filtered or collapsed. Clicking each card
 * would assert the same thing far more slowly.
 *
 * The sections are counted off the page rather than listed: an empty tier is not
 * rendered at all, and the accessibility section appears only when a run found
 * violations. Which of them this report has is a property of the corpus, and
 * this lane may not know one.
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

/**
 * Leave the report and arm the accept tab for it.
 *
 * Both accept steps do this, and it is the same three actions in the same order
 * — leave, switch, choose — so it lives once. What differs between them is what
 * they assert afterwards, which is the whole of what each step is about.
 */
async function armAccept(vd: ConsolePage, report: ReportPage, reportId: string) {
  await report.backToConsole.click();
  await vd.selectJobMode('accept');
  await vd.chooseAcceptReport(reportId);
}

/** The report the newest finished job wrote, read off its own link — the lane's
 *  way of learning an id without naming one. */
async function reportIdFromJob(vd: ConsolePage): Promise<string> {
  await expect(vd.viewReportLink).toBeVisible({ timeout: JOB_TIMEOUT });

  const href = await vd.viewReportLink.getAttribute('href');
  expect(href, 'the finished job links nowhere').toBeTruthy();

  return (href ?? '').replace(/^\/report\//, '');
}

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
  expect(
    localState.capturedLabel,
    'no step named a set before this one tried to run it',
  ).toBeTruthy();

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
});

Then(
  'the capture finishes and the set is listed',
  async ({ console: vd, localState }) => {
    await expect(vd.currentJob).toContainText(localState.capturedLabel ?? '');
    await expect(vd.liveLog).toBeVisible();
    // The terminal line, not growth: a milestone survives a job that finishes
    // between two reads. `exit \d` rather than `exit 0` because a run that found
    // differences exits 1, and finding differences is the ordinary outcome of a
    // capture worth comparing — this step is about the job ending, not its verdict.
    await expect(vd.liveLog).toContainText(/exit \d/, { timeout: JOB_TIMEOUT });

    // A set, and deliberately not a report. `runCheck` answers with
    // `reportId: null` — a capture writes a shot tree and nothing else, and
    // the comparison that turns two of those into a report is the next scenario.
    await expect(vd.setRow(localState.capturedLabel ?? '')).toBeVisible();
  },
);

/**
 * Compare the newest capture against the committed corpus.
 *
 * BOTH sides are picked by position, and neither is carried over from the
 * scenario that captured. `localState` is a fixture — a fresh object per
 * scenario, exactly as the browser profile is a fresh one — so anything a
 * scenario tells the next has to go through the page.
 *
 * Position names nothing, which is this lane's rule. `DashboardTemplate` puts
 * the corpus at the head of the list ahead of every capture, and the captures
 * follow it newest first: index 0 is the corpus, index 1 is whatever was
 * captured last, which under `@mode:serial` is the scenario before this one.
 *
 * The pair is read back off the pickers rather than assumed, because the report
 * this produces is named `<A>__<B>` and the assertion after it checks the two
 * agree.
 */
When(
  'I compare my newest capture against the corpus',
  async ({ console: vd, localState }) => {
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

    localState.reportId = `${corpus}__${captured}`;

    await vd.compareButton.click();
    await vd.startButton.click();
    await expect(
      vd.refusalAlert,
      'the console refused this compare — its own reason is in the run panel',
    ).toHaveCount(0);
  },
);

Then(
  'the comparison finishes and writes a report',
  async ({ console: vd, localState }) => {
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
  },
);

When(
  'I open the report that comparison wrote',
  async ({ console: vd, report, localState }) => {
    await vd.openHere();
    localState.reportId = await reportIdFromJob(vd);

    await report.openHere(localState.reportId);
  },
);

When('I mark the whole report reviewed', async ({ report }) => {
  await markEverySection(report);
});

Then('every variant of that report is marked', async ({ report }) => {
  await expect(report.uncheckedCards()).toHaveCount(0);
  // Not vacuous: a report with no cards would satisfy the line above on its own.
  await expect(report.checkedCards()).not.toHaveCount(0);
  // The pinned `reviewed N/M` format, asserted as N === M through a backreference
  // rather than against a number this lane may not know. Anchored at both ends:
  // `toHaveText` does not anchor a RegExp for you, so unanchored this would also
  // pass on any string that merely contains a matching pair.
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

/**
 * The review, again, for a scenario that did not do it.
 *
 * A review mark lives in `localStorage` and every scenario gets a fresh browser
 * context, so the one before this took its marks with it. Re-reading is what
 * the acceptance lane does for the same reason, and it keeps this scenario true
 * on its own rather than true only in sequence.
 */
Given(
  'the report that comparison wrote is fully reviewed',
  async ({ console: vd, report, localState }) => {
    await vd.openHere();
    localState.reportId = await reportIdFromJob(vd);

    await report.openHere(localState.reportId);
    await markEverySection(report);
    await expect(report.uncheckedCards()).toHaveCount(0);
  },
);

When('I accept it', async ({ console: vd, report, localState }) => {
  await armAccept(vd, report, localState.reportId ?? '');

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
  // `exit 0` and not `exit \d` here, unlike the run above: a promote that failed
  // wrote nothing, and there is no partial success worth passing this step on.
  await expect(vd.liveLog).toContainText(/exit 0/, { timeout: PROMOTE_TIMEOUT });
});

Then(
  'the history records the accept as succeeded',
  async ({ console: vd, localState }) => {
    // Identity first, and NOT from the history table: its columns are status,
    // type, started, exit and took — there is no label column, so a row cannot
    // be matched on the report id at all. The label of an accept IS its report
    // id, and the current-job region is the one place a label is drawn.
    await expect(vd.currentJob).toContainText(localState.reportId ?? '');

    // Then the row, which is the newest accept — history is newest first, and
    // under `@mode:serial` nothing else has run since this scenario's promote.
    const row = vd.historyRow(/accept/).first();

    await expect(vd.historyCell(row, 'type')).toHaveText('accept');
    await expect(vd.historyCell(row, 'status')).toHaveText('succeeded');
    await expect(vd.historyCell(row, 'exit')).toHaveText('0');
  },
);
