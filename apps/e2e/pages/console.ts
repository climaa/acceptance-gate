import type { Locator, Page } from '@playwright/test';

import { VD_HOSTS, type VdWorld } from './visual-diff-hosts';

/** The four modes the run panel offers, which are the four the runner has. */
/** The modes the run panel offers. `run` is absent on purpose: it was a second
 *  name for `capture` and spawned the same job, so the tab is gone. */
export type JobMode = 'capture' | 'compare' | 'accept';

/**
 * The visual-diff console at `/`, in every world.
 *
 * Every locator below is one row of the selector contract the app implements
 * across #275/#279/#280/#282 — ARIA first, a `data-testid` only where no role
 * fits. A hook that cannot be found here is a bug report against the app, never
 * a locator worked around in this file.
 */
/** A whole-string match for a `hasText` that would otherwise be a substring
 *  test. Anchored and escaped: capture labels carry `-` and `.`, and a label
 *  read off the page is data, never a pattern. */
function exactly(text: string): RegExp {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

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
  readonly reportRows: Locator;
  readonly refusalAlert: Locator;
  readonly dialogRefusal: Locator;
  readonly sampleBadge: Locator;
  readonly sampleModeNote: Locator;
  readonly sampleReportLink: Locator;
  readonly acceptReport: Locator;
  readonly acceptGateNote: Locator;
  readonly dockerRequiredNote: Locator;
  readonly acceptDockerCommand: Locator;
  readonly copyCommandButton: Locator;
  readonly labelWand: Locator;

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
      name: /^start (capture|compare|accept)$/,
    });
    this.currentJob = page.getByRole('region', { name: 'Current job' });
    this.viewReportLink = this.currentJob.getByRole('link', { name: 'view report' });
    // The log is a stream, not a table — no ARIA role fits a tail of stdout,
    // so it carries a testid instead.
    this.liveLog = page.getByTestId('log-tail');
    this.historyRows = page.getByRole('table', { name: 'History' }).getByRole('row');
    this.reportRows = page.getByRole('table', { name: 'Reports' }).getByRole('row');
    // Scoped to `main`, because Next's app router keeps a permanent
    // `<div role="alert" id="__next-route-announcer__">` outside the page's own
    // tree for route changes: a page-wide `role=alert` lookup resolves to two
    // elements the moment the console refuses anything, and every refusal this
    // suite reads is inside the page's own landmark.
    //
    // The confirm dialogs are NOT inside it: `Dialog` portals to `document.body`
    // (#319), so a refusal drawn inside one is `dialogRefusal` below and never a
    // second match here. Before that portal both landed in `main`, and a delete
    // refused *because a job is running* — with the run panel already announcing
    // the same sentence — failed every scenario on this line's strict mode.
    this.refusalAlert = page.getByRole('main').getByRole('alert');
    // Every refusal a confirmation draws, read where it is spoken. Deliberately
    // a second locator rather than a loosening of the one above: a dialog's
    // refusal answers what the reviewer just did inside the dialog, and the
    // page's own alerts stay something a strict lookup can count.
    this.dialogRefusal = page.getByRole('dialog').getByRole('alert');
    this.sampleBadge = page.getByRole('status', { name: 'sample data' });
    this.sampleModeNote = page.getByRole('note', { name: 'sample mode' });
    this.sampleReportLink = page.getByRole('link', { name: /__/ }).first();
    this.acceptReport = page.getByRole('combobox', { name: 'report' });
    this.acceptGateNote = page.getByRole('note', { name: 'accept gate' });
    this.dockerRequiredNote = page.getByRole('note', { name: 'docker required' });
    // Command text is a code block, not interactive — testid, like log-tail.
    this.acceptDockerCommand = page.getByTestId('accept-docker-command');
    this.copyCommandButton = page.getByRole('button', { name: 'copy command' });
    // Icon-only, so its `aria-label` is the only name it has — which is exactly
    // why the atom makes that name a required prop.
    this.labelWand = page.getByRole('button', { name: 'suggest a label' });
  }

  async open(world: VdWorld = 'seeded') {
    await this.page.goto(`${VD_HOSTS[world]}/`);
  }

  /** The same console, reached through the running config's `baseURL` instead of
   *  a named world — how the local lane finds the dev server on 3300. The worlds
   *  above are absolute by design (one config boots four servers and a scenario
   *  says which it means); a lane with one server must not name a port at all. */
  async openHere() {
    await this.page.goto('/');
  }

  /**
   * One set row, by its label EXACTLY.
   *
   * Not `hasText`, which is a substring test over the whole row: real capture
   * labels nest — a tree holding `2026-08-21` alongside `2026-08-21-2` and
   * `main-2026-08-21` has one label that is a substring of six others, and the
   * row lookup for the short one resolves to all seven. The seeded worlds' five
   * labels do not overlap, so only the local lane can see this; the fix belongs
   * here anyway, because "the row for this set" is a selector-contract question
   * and not something a step should work around.
   *
   * Matched on the label element rather than the row so the `dirty` badge beside
   * it, and the branch and hash cells after it, cannot join the comparison.
   */
  setRow(label: string): Locator {
    return this.setRows.filter({
      has: this.page.locator('.vd-set__label', { hasText: exactly(label) }),
    });
  }

  jobTab(mode: JobMode): Locator {
    return this.page.getByRole('tab', { name: mode });
  }

  async selectJobMode(mode: JobMode) {
    await this.jobTab(mode).click();
  }

  async chooseCompare(a: string, b: string) {
    await this.pickerA.selectOption({ label: a });
    await this.pickerB.selectOption({ label: b });
    await this.compareButton.click();
  }

  /** Which report an accept would promote from. Named rather than left to the
   *  picker's default: the gate asks every one of its questions about this
   *  report, so a scenario about one of its answers has to say which report it
   *  means. */
  async chooseAcceptReport(reportId: string) {
    await this.acceptReport.selectOption({ label: reportId });
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

  /**
   * One row of the reports panel, by the report id its link carries — EXACTLY,
   * for the reason `setRow` above is exact.
   *
   * A report id is `<A>__<B>`, so it inherits the nesting of the labels it is
   * built from: `main-2026-08-22__main-2026-08-21` is a substring of
   * `main-2026-08-22__main-2026-08-21-2`, which exists as soon as a second set is
   * captured on the same day and compared. Matched on the link, whose own text is
   * the id, rather than on the row, whose text is the id run together with the
   * rest of the cells.
   */
  reportRow(id: string): Locator {
    return this.reportRows.filter({
      has: this.page.getByRole('link', { name: exactly(id) }),
    });
  }

  historyRow(outcome: RegExp): Locator {
    return this.historyRows.filter({ hasText: outcome });
  }

  /**
   * One cell of a history row, addressed by the column it sits under.
   *
   * A row's own text is its cells run together with no separator — a compare
   * that exited 1 after 1m 35s reads as `…09:41:02Z11m 35sview`, where the exit
   * code has a digit on one side and a timestamp on the other and so has no
   * word boundary left to match on. Asserting a single column against that
   * string is a coin toss, so per-column assertions address the cell.
   *
   * `data-label` is the column's own header, set by `Table` for the sub-768px
   * card reflow (it is what the cell's `::before` prints) — a rendered property
   * of the column, not a hook added for this suite. The generated content is
   * not part of `textContent`, so it never lands in the assertion.
   */
  historyCell(row: Locator, column: string): Locator {
    return this.cell(row, column);
  }

  /** The same addressing for the sets table, whose columns are `label`, `sha`,
   *  `branch`, `date`, `stories` and `size`. Named separately from
   *  `historyCell` so a step reads as the table it means. */
  setCell(row: Locator, column: string): Locator {
    return this.cell(row, column);
  }

  /** One cell of any `Table` row, by the column header it sits under. */
  private cell(row: Locator, column: string): Locator {
    return row.locator(`[data-label="${column}"]`);
  }

  /** The committed corpus above the sets table: its label, its `canonical`
   *  badge, and the delete it renders disabled rather than omitting. */
  get canonicalCorpus(): Locator {
    return this.page.locator('.vd-canonical');
  }

  /** A set row's label alone. The label cell also carries the `dirty` badge as a
   *  second text node — deliberately, so a label is never "main-08-11dirty" —
   *  which means the cell's own text is not the label. */
  setLabel(row: Locator): Locator {
    return row.locator('.vd-set__label');
  }

  /** Every option a picker offers, as text — the compare vocabulary the console
   *  is willing to offer, which is the sets plus the committed corpus. */
  pickerOptions(picker: Locator): Locator {
    return picker.locator('option');
  }

  /** The report id a reports row links to. The link's own text is that id. */
  reportLink(row: Locator): Locator {
    return row.getByRole('link');
  }

  /** Where the run panel puts the label of a `capture`/`run`, or the two sides
   *  of a `compare`. Addressed by the ids the panel pins on them. */
  runField(name: 'label' | 'baseline' | 'candidate' | 'report'): Locator {
    return this.page.locator(`#vd-run-${name}`);
  }
}
