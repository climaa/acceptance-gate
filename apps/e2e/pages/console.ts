import type { Locator, Page } from '@playwright/test';

import { VD_HOSTS, type VdWorld } from './visual-diff-hosts';

/** The four modes the run panel offers, which are the four the runner has. */
export type JobMode = 'capture' | 'compare' | 'run' | 'accept';

/**
 * The visual-diff console at `/`, in every world.
 *
 * Every locator below is one row of the selector contract the app implements
 * across #275/#279/#280/#282 — ARIA first, a `data-testid` only where no role
 * fits. A hook that cannot be found here is a bug report against the app, never
 * a locator worked around in this file.
 */
export class ConsolePage {
  readonly setsTable: Locator;
  readonly setRows: Locator;
  readonly pickerA: Locator;
  readonly pickerB: Locator;
  readonly compareButton: Locator;
  readonly keepLatest: Locator;
  readonly pruneButton: Locator;
  readonly startButton: Locator;
  readonly currentJob: Locator;
  readonly viewReportLink: Locator;
  readonly liveLog: Locator;
  readonly historyRows: Locator;
  readonly refusalAlert: Locator;
  readonly acceptReport: Locator;
  readonly acceptGateNote: Locator;
  readonly acceptHostAlert: Locator;
  readonly acceptDockerCommand: Locator;
  readonly copyCommandButton: Locator;
  readonly sampleBadge: Locator;
  readonly sampleModeNote: Locator;
  readonly sampleReportLink: Locator;

  constructor(private readonly page: Page) {
    this.setsTable = page.getByRole('table', { name: 'Snapshot sets' });
    this.setRows = this.setsTable
      .getByRole('row')
      .filter({ has: page.getByRole('cell') });
    this.pickerA = page.getByRole('combobox', { name: 'A' });
    this.pickerB = page.getByRole('combobox', { name: 'B' });
    this.compareButton = page.getByRole('button', { name: 'compare A ⇄ B' });
    this.keepLatest = page.getByRole('spinbutton', { name: 'keep latest' });
    this.pruneButton = page.getByRole('button', { name: 'prune the rest' });
    this.startButton = page.getByRole('button', {
      name: /^start (capture|compare|run|accept)$/,
    });
    this.currentJob = page.getByRole('region', { name: 'Current job' });
    this.viewReportLink = this.currentJob.getByRole('link', { name: 'view report' });
    // The log is a stream, not a table — no ARIA role fits a tail of stdout,
    // so it carries a testid instead.
    this.liveLog = page.getByTestId('log-tail');
    this.historyRows = page.getByRole('table', { name: 'History' }).getByRole('row');
    // Scoped to `main`, because Next's app router keeps a permanent
    // `<div role="alert" id="__next-route-announcer__">` appended to
    // `document.body` for route changes: a page-wide `role=alert` lookup
    // resolves to two elements the moment the console refuses anything, and
    // every refusal this suite reads is inside the page's own landmark.
    this.refusalAlert = page.getByRole('main').getByRole('alert');
    this.acceptReport = page.getByRole('combobox', { name: 'report' });
    this.acceptGateNote = page.getByRole('note', { name: 'accept gate' });
    // The same `role=alert` `refusalAlert` finds, under the name the accept
    // scenarios read it by: on the accept tab, the refusal on screen is the
    // gate's.
    this.acceptHostAlert = this.refusalAlert;
    // Command text is a code block, not interactive — testid, like log-tail.
    this.acceptDockerCommand = page.getByTestId('accept-docker-command');
    this.copyCommandButton = page.getByRole('button', { name: 'copy command' });
    this.sampleBadge = page.getByRole('status', { name: 'sample data' });
    this.sampleModeNote = page.getByRole('note', { name: 'sample mode' });
    this.sampleReportLink = page.getByRole('link', { name: /__/ }).first();
  }

  async open(world: VdWorld = 'seeded') {
    await this.page.goto(`${VD_HOSTS[world]}/`);
  }

  setRow(label: string): Locator {
    return this.setRows.filter({ hasText: label });
  }

  jobTab(mode: JobMode): Locator {
    return this.page.getByRole('tab', { name: mode });
  }

  async selectJobMode(mode: JobMode) {
    await this.jobTab(mode).click();
  }

  /** Which report an accept would promote from. Named rather than left to the
   *  picker's default: the gate asks every one of its questions about this
   *  report, so a scenario about one of its answers has to say which report it
   *  means. */
  async chooseAcceptReport(reportId: string) {
    await this.acceptReport.selectOption({ label: reportId });
  }

  async chooseCompare(a: string, b: string) {
    await this.pickerA.selectOption({ label: a });
    await this.pickerB.selectOption({ label: b });
    await this.compareButton.click();
  }

  /** The label text of a picker's selected option — asserting selection without
   *  assuming option value === label (the contract pins the label, not the value). */
  selectedOption(picker: Locator): Locator {
    return picker.locator('option:checked');
  }

  /** Destructive actions are never immediate (D2, guidelines): delete opens a
   *  confirmation dialog naming the set; this drives both steps. */
  async deleteSet(label: string) {
    await this.setRow(label).getByRole('button', { name: 'delete' }).click();
    await this.page
      .getByRole('dialog', { name: 'Confirm deletion' })
      .getByRole('button', { name: 'delete' })
      .click();
  }

  async pruneKeeping(n: string) {
    await this.keepLatest.fill(n);
    await this.pruneButton.click();
    await this.page
      .getByRole('dialog', { name: 'Confirm prune' })
      .getByRole('button', { name: 'prune' })
      .click();
  }

  historyRow(outcome: RegExp): Locator {
    return this.historyRows.filter({ hasText: outcome });
  }
}
