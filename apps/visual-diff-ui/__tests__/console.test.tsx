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

interface ConsoleContents {
  sets?: CaptureSet[];
  sizes?: Record<string, number>;
  reports?: ReportListEntry[];
  history?: HistoryRecord[];
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
}: ConsoleContents = {}) {
  return (
    <DashboardTemplate
      sets={sets}
      sizes={sizes}
      reports={reports}
      history={history}
      isSample={false}
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
      '106',
      '95.5 MB',
      'delete',
    ]);
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
      RUN.startedAt,
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
      INTERRUPTED.startedAt,
      '—',
      '—',
      '',
    ]);
  });

  it('links a run that produced a report into it', () => {
    render(consoleWith({ history: [RUN] }));

    const view = screen.getByRole('link', { name: 'view' });

    expect(view.getAttribute('href')).toBe(`/report/${RUN.reportId}`);
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
    ['Snapshot sets', '106'],
    ['Snapshot sets', '95.5 MB'],
    ['History', '1'],
    ['History', '1m 35s'],
  ];

  it.each(NUMERIC)('lines up %s’s %s column', (name, text) => {
    render(consoleWith({ sets: [CLEAN], history: [RUN] }));

    const cell = within(table(name)).getByText(text);

    expect(cell.className).toContain('vd-table__cell--numeric');
  });
});
