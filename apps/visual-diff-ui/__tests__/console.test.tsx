// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, describe, expect, it } from 'vitest';
import { DashboardTemplate } from '../components/DashboardTemplate';
import type { HistoryRecord } from '../lib/jobs';
import type { CaptureSet } from '../lib/summary';
import type { ReportListEntry } from '../lib/data';
import { replaceCalls } from './stubs/next-navigation';

/**
 * The console's read surface: three tables, the compare seam, and the retention
 * control.
 *
 * Rendered through `DashboardTemplate` rather than through the page, because the
 * page's only job is to resolve the data directory and hand the readers'
 * answers over — that resolution has its own suite (data.test.ts), and this one
 * is about what a reviewer can see and reach.
 *
 * Nothing here asserts appearance. What the reflow-to-cards looks like below
 * 768 px belongs to the differ; what survives it — the roles, the names, the
 * `title` a truncated cell carries — is what jsdom can see and pixels cannot.
 */

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(() => {
  cleanup();
  replaceCalls.length = 0;
});

const CLEAN: CaptureSet = {
  label: 'main-2026-08-17',
  sha: 'f2570e1',
  branch: 'main',
  capturedAt: '2026-08-17',
  stories: 106,
};

const DIRTY: CaptureSet = {
  label: 'wip-2026-08-16',
  sha: 'abc1234',
  branch: 'feat/a-branch-name-long-enough-to-truncate',
  capturedAt: '2026-08-16',
  stories: 104,
  dirty: true,
};

const REPORT: ReportListEntry = {
  id: 'main-2026-08-17__main-2026-08-13',
  exitCode: 1,
  counts: { unchanged: 100, changed: 6, added: 0, removed: 0, errored: 0, a11y: 0 },
};

const RUN: HistoryRecord = {
  id: '2026-08-17T08-00-00Z-compare',
  mode: 'compare',
  label: 'main-2026-08-17__main-2026-08-13',
  startedAt: '2026-08-17T08:00:00Z',
  endedAt: '2026-08-17T08:01:35Z',
  exitCode: 1,
  reportId: 'main-2026-08-17__main-2026-08-13',
};

const INTERRUPTED: HistoryRecord = {
  id: '2026-08-11T08-15-04Z-capture',
  mode: 'capture',
  label: 'main-2026-08-11',
  startedAt: '2026-08-11T08:15:04Z',
  endedAt: null,
  exitCode: null,
  reportId: null,
};

/** The committed corpus, as a checkout with one would report it. */
const CORPUS = {
  label: 'baselines',
  sha: '8b95e14',
  acceptedAt: '2026-08-18',
  stories: 130,
  bytes: 1_700_000,
};

interface ConsoleContents {
  sets?: CaptureSet[];
  sizes?: Record<string, number>;
  reports?: ReportListEntry[];
  history?: HistoryRecord[];
  /** Null by default: most of this suite is about the captured sets, and a
   *  checkout is not something a template case should have to have. */
  corpus?: typeof CORPUS | null;
  /** Null by default: nothing holds the lock, so every history row is a run
   *  that is over. The one case that sets it is the one about a live job. */
  runningId?: string | null;
  /** True by default: this suite is about a console someone is looking at on
   *  their own machine, which is the only kind that can mutate anything. */
  isLocal?: boolean;
}

/** The console with everything populated, unless a case says otherwise.
 *
 *  Never in sample mode: this suite is about the read surface, and the write
 *  half's own suites (run-panel, current-job, confirm-dialogs) own what the
 *  controls do. The two client islands in the right column poll on mount and
 *  jsdom answers neither — both treat an unreachable API as "nothing running",
 *  which is what keeps this suite about the tables. */
function consoleWith({
  sets = [CLEAN, DIRTY],
  sizes = { [CLEAN.label]: 95_500_000, [DIRTY.label]: 1000 },
  reports = [REPORT],
  history = [RUN, INTERRUPTED],
  corpus = null,
  runningId = null,
  isLocal = true,
}: ConsoleContents = {}) {
  return (
    <DashboardTemplate
      sets={sets}
      sizes={sizes}
      reports={reports}
      history={history}
      isSample={false}
      isLocal={isLocal}
      corpus={corpus}
      runningId={runningId}
    />
  );
}

const table = (name: string) => screen.getByRole('table', { name });

/** A named table's two row groups: the header row's, then the data rows'. */
function groupsOf(name: string): [HTMLElement, HTMLElement] {
  const [head, body] = within(table(name)).getAllByRole('rowgroup');
  if (!head || !body) throw new Error(`${name} is missing a row group`);

  return [head, body];
}

/** The data rows of a named table — the second `rowgroup` skips the header. */
function rowsOf(name: string): HTMLElement[] {
  const [, body] = groupsOf(name);

  return within(body).getAllByRole('row');
}

/** The first data row, for the cases that render exactly one. */
function firstRowOf(name: string): HTMLElement {
  const [row] = rowsOf(name);
  if (!row) throw new Error(`${name} has no data rows`);

  return row;
}

const cellsOf = (row: HTMLElement) =>
  within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent);

describe('the snapshot sets panel', () => {
  it('names its table, so the page can hold more than one', () => {
    render(consoleWith());

    expect(table('Snapshot sets')).toBeDefined();
  });

  // The acceptance scenario, cell by cell: "I see each snapshot set with its
  // branch, story count and size".
  it('lists a set with its branch, story count and size', () => {
    render(consoleWith({ sets: [CLEAN] }));

    const row = firstRowOf('Snapshot sets');

    expect(cellsOf(row)).toEqual([
      'main-2026-08-17',
      'f2570e1',
      'main',
      '2026-08-17',
      '106 stories',
      '95.5 MB',
      'delete',
    ]);
  });

  /**
   * The unit is in the cell, clipped, rather than left to the column header.
   *
   * Below 768 px the row reflows into a card whose per-cell label is `::before`
   * generated content, and generated content is not in the accessibility tree —
   * so a reader hears "106" with nothing to say what 106 is. The acceptance
   * scenario reads the same text ("its branch, story count and size"), which is
   * why the words are the cell's rather than the stylesheet's.
   */
  it('carries the story count with its unit, clipped rather than drawn', () => {
    render(consoleWith({ sets: [CLEAN] }));

    const unit = within(firstRowOf('Snapshot sets')).getByText('stories');

    expect(unit.className).toBe('ds-visually-hidden');
  });

  it('reports a set this instance holds no shots for as an unknown size', () => {
    render(consoleWith({ sets: [CLEAN], sizes: {} }));

    const row = firstRowOf('Snapshot sets');

    expect(cellsOf(row)).toContain('—');
  });

  it('offers a delete button per set', () => {
    render(consoleWith());

    const deletes = within(table('Snapshot sets')).getAllByRole('button', {
      name: 'delete',
    });

    expect(deletes).toHaveLength(2);
  });

  it('shows an empty state instead of a table when nothing has been captured', () => {
    render(consoleWith({ sets: [] }));

    expect(screen.queryByRole('table', { name: 'Snapshot sets' })).toBeNull();
    expect(screen.getByText(/captured nothing yet/i)).toBeDefined();
  });

  // The board's column is seven characters wide. A registry written with a full
  // sha must not widen it past every cell beside it, and the whole sha is what
  // a reviewer copies out of the row.
  it('shortens a full-length sha and keeps the whole one on title', () => {
    const full = 'f2570e10ba3739e79f7124c06b823e5b8fb806ce';
    render(consoleWith({ sets: [{ ...CLEAN, sha: full }] }));

    const sha = screen.getByTitle(full);

    expect(sha.textContent).toBe('f2570e1');
  });

  it('carries the full branch name on a cell that truncates it', () => {
    render(consoleWith({ sets: [DIRTY] }));

    const branch = screen.getByTitle(DIRTY.branch);

    expect(branch.textContent).toBe(DIRTY.branch);
  });
});

describe('the dirty badge', () => {
  it('marks a set captured from a tree that was not clean', () => {
    render(consoleWith({ sets: [DIRTY] }));

    const badge = screen.getByText('dirty');

    expect(badge.className).toBe('ds-badge ds-badge--warning');
  });

  it('is absent from a set captured from a clean tree', () => {
    render(consoleWith({ sets: [CLEAN] }));

    expect(screen.queryByText('dirty')).toBeNull();
  });
});

describe('the compare pickers', () => {
  it('labels the two pickers A and B', () => {
    render(consoleWith());

    expect(screen.getByRole('combobox', { name: 'A' })).toBeDefined();
    expect(screen.getByRole('combobox', { name: 'B' })).toBeDefined();
  });

  // The pinned half of the contract: the scenario chooses a set by the text it
  // reads, so the option's label is the set's label and not an id of this app's.
  it('offers every set as an option, labelled by its set label', () => {
    render(consoleWith());

    const options = within(screen.getByRole('combobox', { name: 'A' })).getAllByRole(
      'option',
    );

    expect(options.map((option) => option.textContent)).toEqual([
      CLEAN.label,
      DIRTY.label,
    ]);
  });

  // Nothing pre-fills the run panel but the URL: no store, no context. The panel
  // reads these three params back with `useSearchParams()` — see
  // __tests__/run-panel.test.tsx, which drives the other half of this seam.
  it('writes the chosen pair into the URL as a compare request', () => {
    render(consoleWith());

    fireEvent.click(screen.getByRole('button', { name: 'compare A ⇄ B' }));

    expect(replaceCalls.map((call) => call.url)).toEqual([
      `/?a=${CLEAN.label}&b=${DIRTY.label}&mode=compare`,
    ]);
  });

  it('sends the reviewer the pair they chose, not the pair it opened with', () => {
    render(consoleWith());
    fireEvent.change(screen.getByRole('combobox', { name: 'B' }), {
      target: { value: CLEAN.label },
    });

    fireEvent.click(screen.getByRole('button', { name: 'compare A ⇄ B' }));

    expect(replaceCalls.map((call) => call.url)).toEqual([
      `/?a=${CLEAN.label}&b=${CLEAN.label}&mode=compare`,
    ]);
  });

  /**
   * `router.refresh()` re-renders this island without remounting it, so the
   * `useState` initialisers run once and the list moves under them afterwards —
   * a delete or a prune takes a label away. A `<select>` holding a value no
   * option carries renders with nothing selected, and the button beside it would
   * send the run panel a set this instance does not have.
   */
  it('follows the list when the set it had selected is gone', () => {
    const { rerender } = render(consoleWith());
    rerender(
      consoleWith({ sets: [DIRTY], sizes: { [DIRTY.label]: 1000 }, corpus: CORPUS }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'compare A ⇄ B' }));

    expect(replaceCalls.at(-1)?.url).toBe(
      `/?a=${CORPUS.label}&b=${DIRTY.label}&mode=compare`,
    );
  });

  // The other half of the same rule. A capture finishing puts a new label at the
  // head of the list, and a selection that moves under the cursor is worse than
  // a default that has aged — so a pair still on offer is left alone.
  it('keeps a pair that is still on offer when a new set arrives', () => {
    const { rerender } = render(consoleWith());
    fireEvent.change(screen.getByRole('combobox', { name: 'B' }), {
      target: { value: CLEAN.label },
    });
    rerender(consoleWith({ corpus: CORPUS }));

    fireEvent.click(screen.getByRole('button', { name: 'compare A ⇄ B' }));

    expect(replaceCalls.at(-1)?.url).toBe(
      `/?a=${CLEAN.label}&b=${CLEAN.label}&mode=compare`,
    );
  });

  // A URL change that scrolled the page would move the table the reviewer just
  // picked from out from under them.
  it('replaces the URL without scrolling', () => {
    render(consoleWith());

    fireEvent.click(screen.getByRole('button', { name: 'compare A ⇄ B' }));

    expect(replaceCalls[0]?.options).toEqual({ scroll: false });
  });
});

describe('the retention control', () => {
  it('offers a keep-latest count and a prune button', () => {
    render(consoleWith());

    expect(screen.getByRole('spinbutton', { name: 'keep latest' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'prune the rest' })).toBeDefined();
  });
});

describe('the history panel', () => {
  it('names its table, so the page can hold more than one', () => {
    render(consoleWith());

    expect(table('History')).toBeDefined();
  });

  // The acceptance scenario: "the history lists each run with its outcome, exit
  // code and duration".
  it('lists a run with its outcome, exit code and duration', () => {
    render(consoleWith({ history: [RUN] }));

    const row = firstRowOf('History');

    expect(cellsOf(row)).toEqual([
      'succeeded (diffs)',
      'compare',
      '2026-08-17 08:00:00',
      '1',
      '1m 35s',
      'view',
    ]);
  });

  // A run the container went away under: lib/jobs.ts keeps the nulls rather
  // than inventing a verdict, and the table has to say so rather than show a 0.
  it('reports a run that never finished as interrupted, with nothing to show', () => {
    render(consoleWith({ history: [INTERRUPTED] }));

    const row = firstRowOf('History');

    expect(cellsOf(row)).toEqual([
      'interrupted',
      'capture',
      '2026-08-11 08:15:04',
      '—',
      '—',
      '',
    ]);
  });

  /**
   * The same record as INTERRUPTED, told apart by the lock and nothing else.
   *
   * That is the whole point: `startJob` writes the row with `endedAt`,
   * `exitCode` and `reportId` all null and only the end of the job patches
   * them, so on disk a live job and one the container went away under are the
   * same three nulls. The table drew both as `interrupted` — beside a CURRENT
   * JOB region reading `running`.
   */
  it('reports the row the lock is holding as running, with nothing to show yet', () => {
    render(consoleWith({ history: [INTERRUPTED], runningId: INTERRUPTED.id }));

    expect(cellsOf(firstRowOf('History'))).toEqual([
      'running',
      'capture',
      '2026-08-11 08:15:04',
      '—',
      '—',
      '',
    ]);
  });

  // The lock naming a row that already carries a verdict: `currentJob` reads the
  // lock and then the history, so a job that finishes between those two reads
  // arrives here as both. The exit code wins — a row saying `running` beside
  // `exit 1` is the disagreement lib/outcome.ts exists to prevent.
  it('reports a row that already has its exit code as what it came to', () => {
    render(consoleWith({ history: [RUN], runningId: RUN.id }));

    expect(cellsOf(firstRowOf('History'))[0]).toBe('succeeded (diffs)');
  });

  it('links a run that produced a report into it', () => {
    render(consoleWith({ history: [RUN] }));

    const view = screen.getByRole('link', { name: 'view' });

    expect(view.getAttribute('href')).toBe(`/report/${RUN.reportId}`);
  });

  /**
   * The row that outlived its report.
   *
   * History is append-only and `removeReport` deletes a tree without touching
   * it, so deleting a report leaves every run that produced it still naming it.
   * The cell used to link on the id alone, and this console shipped showing
   * `reports (1)` beside a history column of `view` links into 404s — one per
   * comparison ever deleted.
   */
  it('offers no link on a run whose report has since been deleted', () => {
    render(consoleWith({ history: [RUN], reports: [] }));

    expect(screen.queryByRole('link', { name: 'view' })).toBeNull();
    // The row itself stays: what ran is still what ran, and only the way into
    // a report that is gone is withdrawn.
    expect(cellsOf(firstRowOf('History'))[0]).toBe('succeeded (diffs)');
  });

  it('shows an empty state instead of a table when nothing has run', () => {
    render(consoleWith({ history: [] }));

    expect(screen.queryByRole('table', { name: 'History' })).toBeNull();
    expect(screen.getByText(/nothing has run yet/i)).toBeDefined();
  });
});

describe('the reports panel', () => {
  it('names its table, so the page can hold more than one', () => {
    render(consoleWith());

    expect(table('Reports')).toBeDefined();
  });

  it('links each named comparison into its report', () => {
    render(consoleWith());

    const link = screen.getByRole('link', { name: REPORT.id });

    expect(link.getAttribute('href')).toBe(`/report/${REPORT.id}`);
  });

  // The date a comparison was written is the run's, not the file's: history is
  // what knows when the differ finished.
  it('dates a report from the run that produced it', () => {
    render(consoleWith());

    const row = firstRowOf('Reports');

    expect(cellsOf(row)).toEqual([REPORT.id, '2026-08-17', 'delete']);
  });

  /**
   * Absent, not disabled, off localhost.
   *
   * The route refuses the request anyway — a deployed console pointed at a real
   * data directory must not let a visitor destroy the record of every
   * comparison on it — so a button here would be a red control whose only
   * outcome is a refusal, which invites a reviewer to look for the way to
   * enable it. The run panel keeps the same rule one column over.
   */
  it('draws no delete on a console nobody is running locally', () => {
    render(consoleWith({ isLocal: false }));

    const row = firstRowOf('Reports');

    expect(cellsOf(row)).toEqual([REPORT.id, '2026-08-17', '']);
  });

  it('has no date for a report no run in this history claims', () => {
    render(consoleWith({ history: [] }));

    const row = firstRowOf('Reports');

    expect(cellsOf(row)).toEqual([REPORT.id, '—', 'delete']);
  });

  it('offers a delete button per report', () => {
    render(consoleWith());

    const deletes = within(table('Reports')).getAllByRole('button', { name: 'delete' });

    expect(deletes).toHaveLength(1);
  });

  /**
   * Live, and never immediate.
   *
   * This button was drawn disabled for as long as there was no route behind it,
   * on the argument that a red control which takes the click and does nothing is
   * indistinguishable from a delete that failed silently. There is a route now,
   * and D2's rule takes over: a destructive action names what it is about to
   * destroy and waits to be told again.
   */
  it('opens a confirmation naming the report rather than deleting on the click', () => {
    render(consoleWith());

    const [remove] = within(table('Reports')).getAllByRole('button', { name: 'delete' });
    expect(remove).toHaveProperty('disabled', false);
    fireEvent.click(remove as HTMLElement);

    const dialog = screen.getByRole('dialog', { name: 'Confirm deletion' });
    expect(dialog.textContent).toContain(REPORT.id);
    // The other half of the promise the sets dialog makes in reverse: neither
    // deletion cascades into the other.
    expect(dialog.textContent).toMatch(/capture sets it compared stay/i);
  });

  it('shows an empty state instead of a table when nothing has been compared', () => {
    render(consoleWith({ reports: [] }));

    expect(screen.queryByRole('table', { name: 'Reports' })).toBeNull();
    expect(screen.getByText(/compare two capture sets/i)).toBeDefined();
  });
});

/**
 * The one thing the table primitive has to get right: below 768 px the rows
 * reflow to cards, which changes `display` on native table elements — and a
 * browser strips the implicit table/row/cell roles the moment a `<table>` stops
 * being `display: table`. The e2e contract queries those roles at 390 px, so
 * every element states its role rather than inheriting one.
 *
 * jsdom resolves implicit roles too, so `getByRole` alone would pass vacuously
 * here; the assertion is on the attribute.
 */
describe('the table roles', () => {
  it('states the role of the table itself', () => {
    render(consoleWith());

    expect(table('Snapshot sets').getAttribute('role')).toBe('table');
  });

  it('states the role of both row groups', () => {
    render(consoleWith());

    const groups = within(table('Snapshot sets')).getAllByRole('rowgroup');

    expect(groups.map((group) => group.getAttribute('role'))).toEqual([
      'rowgroup',
      'rowgroup',
    ]);
  });

  it('states the role of every row', () => {
    render(consoleWith());

    const rows = within(table('Snapshot sets')).getAllByRole('row');

    expect(rows.map((row) => row.getAttribute('role'))).toEqual(rows.map(() => 'row'));
  });

  it('states the role of every column header', () => {
    render(consoleWith());

    const headers = within(table('Snapshot sets')).getAllByRole('columnheader');

    expect(headers.map((header) => header.getAttribute('role'))).toEqual(
      headers.map(() => 'columnheader'),
    );
  });

  it('states the role of every cell', () => {
    render(consoleWith());

    const cells = within(table('Snapshot sets')).getAllByRole('cell');

    expect(cells.map((cell) => cell.getAttribute('role'))).toEqual(
      cells.map(() => 'cell'),
    );
  });

  // The header row is what a reflowed card's per-cell label is read from, so it
  // is hidden with the clip-rect pattern rather than `display: none`, which
  // would take it out of the accessibility tree along with its roles.
  it('keeps the header row in the document', () => {
    render(consoleWith());

    const [head] = groupsOf('Snapshot sets');

    expect(within(head).getAllByRole('columnheader')).toHaveLength(7);
  });
});

/**
 * Figures that line up column-wise. A structural class rather than an
 * appearance assertion: the column declares itself numeric and the cell carries
 * the hook, which is what a reviewer comparing two story counts down a column
 * depends on. What the hook draws is the differ's.
 */
describe('the numeric cells', () => {
  const NUMERIC: [string, string][] = [
    // The figure's own text node — the clipped unit beside it is a sibling
    // element, which `getByText` does not fold in.
    ['Snapshot sets', '106'],
    ['Snapshot sets', '95.5 MB'],
    ['History', '1'],
    ['History', '1m 35s'],
  ];

  it.each(NUMERIC)('lines up %s’s %s column', (name, text) => {
    render(consoleWith({ sets: [CLEAN], history: [RUN] }));

    const cell = within(table(name)).getByText(text);

    expect(cell.className).toContain('ds-table__cell--numeric');
  });
});

/**
 * The committed corpus, drawn above the sets this instance captured.
 *
 * Above and outside the table: the table's empty state says this instance has
 * captured nothing yet, and the corpus is exactly a thing it did not capture. The
 * count in the panel title means captured sets, and only those.
 */
describe('the canonical corpus', () => {
  it('is absent when there is no checkout to read one from', () => {
    render(consoleWith());

    expect(screen.queryByRole('note', { name: 'canonical corpus' })).toBeNull();
  });

  it('names the commit that accepted it, and what it holds', () => {
    render(consoleWith({ corpus: CORPUS }));

    const region = screen.getByRole('note', { name: 'canonical corpus' }).parentElement
      ?.parentElement;

    expect(region?.textContent).toContain('8b95e14');
    expect(region?.textContent).toContain('2026-08-18');
    expect(region?.textContent).toContain('130');
    expect(region?.textContent).toContain('1.7 MB');
  });

  // Present and disabled rather than absent: the console can never remove this —
  // `DELETE /api/sets/baselines` refuses with the reason — and every capture set
  // below carries the button, so no button at all would read as an omission.
  it('offers a delete that cannot be pressed', () => {
    render(consoleWith({ corpus: CORPUS }));

    const [first] = screen.getAllByRole('button', { name: 'delete' });

    expect(first).toHaveProperty('disabled', true);
  });

  // What it is there for. A reviewer who has just captured is asking what their
  // shots did to the corpus, so it heads both pickers.
  it('is the first thing either compare picker offers', () => {
    render(consoleWith({ corpus: CORPUS }));

    for (const name of ['A', 'B']) {
      const options = [...screen.getByRole('combobox', { name }).children];
      expect(options[0]?.textContent).toBe('baselines');
    }
  });

  // The retention control prunes what this instance accumulated. The corpus is
  // not prunable — the delete route refuses it by name — so it is not offered.
  it('is not something retention can prune', () => {
    render(consoleWith({ corpus: CORPUS }));

    expect(screen.getByRole('table', { name: 'Snapshot sets' })).toBeDefined();
    expect(screen.getByRole('spinbutton', { name: 'keep latest' })).toBeDefined();
  });

  // The count in the panel title, and the rows under it, are captured sets — the
  // corpus adding to either would make one number mean two things.
  it('does not become a row in the snapshot sets table', () => {
    render(consoleWith({ corpus: CORPUS }));

    const rows = screen
      .getByRole('table', { name: 'Snapshot sets' })
      .querySelectorAll('tbody tr');

    expect(rows).toHaveLength(2);
  });
});
