import { cleanup, render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';

import { Table, type TableColumn, type TableProps, type TableRow } from './Table';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(cleanup);

const columns: TableColumn[] = [
  { header: 'Story', truncate: true },
  { header: 'Branch' },
  { header: 'Stories', numeric: true },
];

// The value the truncating column ellipsizes, named so the fixture and the
// assertions that look it up by accessible name cannot drift apart.
const LONG_STORY_ID = 'organisms-table--numeric-and-truncating';

const rows: TableRow[] = [
  {
    key: 'set-1',
    cells: [{ content: LONG_STORY_ID, title: LONG_STORY_ID }, 'main', 106],
  },
  {
    key: 'set-2',
    cells: [
      { content: 'atoms-button--default', title: 'atoms-button--default' },
      'wave-5',
      12,
    ],
  },
];

const renderTable = (props: Partial<TableProps> = {}) =>
  render(<Table label="Snapshot sets" columns={columns} rows={rows} {...props} />);

describe('Table', () => {
  it('is findable by its label', () => {
    renderTable();

    expect(screen.getByRole('table', { name: 'Snapshot sets' }).tagName).toBe('TABLE');
  });

  it('names itself with aria-label rather than a caption', () => {
    renderTable({ label: 'Past runs' });

    expect(screen.getByRole('table').getAttribute('aria-label')).toBe('Past runs');
  });

  // The reflow below 768px changes `display` on every element here, and a browser
  // drops the implicit table roles the moment a <table> stops being `display:
  // table`. jsdom resolves implicit roles regardless of CSS, so `getByRole` alone
  // would pass on markup that goes role-less in a real mobile viewport — only the
  // attribute tells the two apart.
  describe('explicit role attributes', () => {
    it('marks the table itself', () => {
      const { container } = renderTable();

      expect(container.querySelector('table')?.getAttribute('role')).toBe('table');
    });

    it('marks both rowgroups', () => {
      const { container } = renderTable();

      const groups = [container.querySelector('thead'), container.querySelector('tbody')];

      expect(groups.map((group) => group?.getAttribute('role'))).toEqual([
        'rowgroup',
        'rowgroup',
      ]);
    });

    it('marks every row, header row included', () => {
      const { container } = renderTable();

      const attributes = [...container.querySelectorAll('tr')].map((row) =>
        row.getAttribute('role'),
      );

      expect(attributes).toEqual(['row', 'row', 'row']);
    });

    it('marks every header cell', () => {
      const { container } = renderTable();

      const attributes = [...container.querySelectorAll('th')].map((cell) =>
        cell.getAttribute('role'),
      );

      expect(attributes).toEqual(['columnheader', 'columnheader', 'columnheader']);
    });

    it('marks every body cell', () => {
      const { container } = renderTable();

      const attributes = [...container.querySelectorAll('td')].map((cell) =>
        cell.getAttribute('role'),
      );

      expect(attributes).toEqual(Array(rows.length * columns.length).fill('cell'));
    });

    it('leaves no element inside the table without one', () => {
      const { container } = renderTable();

      const bare = [...container.querySelectorAll('table, thead, tbody, tr, th, td')]
        .filter((element) => element.getAttribute('role') === null)
        .map((element) => element.tagName);

      expect(bare).toEqual([]);
    });
  });

  describe('shape', () => {
    it('renders one header cell per column', () => {
      renderTable();

      const headers = screen.getAllByRole('columnheader');

      expect(headers.map((header) => header.textContent)).toEqual([
        'Story',
        'Branch',
        'Stories',
      ]);
    });

    it('renders one row per entry, plus the header row', () => {
      renderTable();

      expect(screen.getAllByRole('row')).toHaveLength(rows.length + 1);
    });

    it('renders one body cell per column in every row', () => {
      renderTable();

      const [, ...bodyRows] = screen.getAllByRole('row');

      expect(
        bodyRows
          .map((row) => within(row).getAllByRole('cell'))
          .map((cells) => cells.length),
      ).toEqual([columns.length, columns.length]);
    });

    it('renders a row with no cells at all', () => {
      renderTable({ rows: [{ key: 'empty', cells: [] }] });

      expect(screen.queryAllByRole('cell')).toHaveLength(0);
      expect(screen.getAllByRole('row')).toHaveLength(2);
    });

    it('renders the header row alone when there are no rows', () => {
      renderTable({ rows: [] });

      expect(screen.getAllByRole('row')).toHaveLength(1);
    });
  });

  describe('column kinds', () => {
    it('gives a numeric column’s cells the tabular-nums class', () => {
      renderTable();

      const numeric = ['106', '12'].map((name) => screen.getByRole('cell', { name }));

      expect(numeric.map((cell) => cell.className)).toEqual([
        'ds-table__cell ds-table__cell--numeric',
        'ds-table__cell ds-table__cell--numeric',
      ]);
    });

    it('gives the numeric column’s header the same class, so the two align', () => {
      renderTable();

      const header = screen.getByRole('columnheader', { name: 'Stories' });

      expect(header.classList.contains('ds-table__cell--numeric')).toBe(true);
    });

    it('leaves a plain column’s cells without either modifier', () => {
      renderTable();

      const plain = screen.getByRole('cell', { name: 'main' });

      expect(plain.className).toBe('ds-table__cell');
    });

    it('gives a truncating column’s cells the truncate class', () => {
      renderTable();

      const truncating = screen.getByRole('cell', { name: LONG_STORY_ID });

      expect(truncating.classList.contains('ds-table__cell--truncate')).toBe(true);
    });

    it('puts the object form’s full value on the cell’s title attribute', () => {
      renderTable();

      const truncating = screen.getByRole('cell', { name: LONG_STORY_ID });

      expect(truncating.getAttribute('title')).toBe(LONG_STORY_ID);
    });

    it('renders no title attribute for the bare form', () => {
      renderTable();

      expect(screen.getByRole('cell', { name: 'main' }).getAttribute('title')).toBe(null);
    });

    // A React element is an object too; only the object *form* carries `title`,
    // and mistaking an element for it would render `[object Object]`.
    it('renders an element cell as itself, not as the object form', () => {
      renderTable({
        rows: [{ key: 'element', cells: [<em key="e">emphasis</em>, 'main', 1] }],
      });

      const cell = screen.getByRole('cell', { name: 'emphasis' });

      expect(cell.querySelector('em')?.textContent).toBe('emphasis');
      expect(cell.getAttribute('title')).toBe(null);
    });
  });

  describe('the reflow’s labels', () => {
    // The card layout draws these through `::before`; generated content never
    // carries the accessible name, which is why the header row also stays in the
    // DOM. Structural here: that the attribute the CSS reads is present and says
    // what the column header says.
    it('carries its column header on every body cell', () => {
      const { container } = renderTable();

      const labels = [...container.querySelectorAll('td')].map((cell) =>
        cell.getAttribute('data-label'),
      );

      expect(labels).toEqual([
        'Story',
        'Branch',
        'Stories',
        'Story',
        'Branch',
        'Stories',
      ]);
    });

    it('omits the label when a row has more cells than there are columns', () => {
      renderTable({ rows: [{ key: 'over', cells: ['a', 'b', 'c', 'd'] }] });

      const extra = screen.getByRole('cell', { name: 'd' });

      expect(extra.getAttribute('data-label')).toBe(null);
    });
  });

  describe('className', () => {
    it('appends a caller-supplied className', () => {
      const { container } = renderTable({ className: 'u-mt-8' });

      expect(container.firstElementChild?.className).toBe('ds-table u-mt-8');
    });

    it('carries only the block class when none is supplied', () => {
      const { container } = renderTable();

      expect(container.firstElementChild?.className).toBe('ds-table');
    });
  });

  describe('column widths', () => {
    it('emits a col per column, carrying the width the column asked for', () => {
      const { container } = renderTable({
        columns: [
          { header: 'Story' },
          { header: 'Branch' },
          { header: '', width: '6rem' },
        ],
      });

      const cols = [...container.querySelectorAll('colgroup > col')];

      // One `col` per column, not one per width: a `colgroup` shorter than the row
      // it sizes would apply the width to the wrong column.
      expect(cols).toHaveLength(3);
      expect(cols.map((col) => (col as HTMLElement).style.width)).toEqual([
        '',
        '',
        '6rem',
      ]);
    });

    it('emits no colgroup when no column asked for a width', () => {
      const { container } = renderTable();

      expect(container.querySelector('colgroup')).toBeNull();
    });

    it('leaves the roles the reflow depends on untouched', () => {
      // `col` renders no box and carries no role, so adding one must not change what
      // the table reports — the mobile card layout is held together by these roles.
      const { container } = renderTable({
        columns: [
          { header: 'Story' },
          { header: 'Branch' },
          { header: '', width: '6rem' },
        ],
      });

      expect(screen.getByRole('table', { name: 'Snapshot sets' })).toBe(
        container.firstElementChild,
      );
      expect(screen.getAllByRole('columnheader')).toHaveLength(3);
    });
  });

  // color-contrast is off: it measures rendered pixels, and jsdom paints none, so
  // the rule reports every node as "incomplete" rather than passing or failing.
  // Contrast is asserted for real against the palette in src/__tests__/tokens.test.ts.
  it('renders markup axe finds no violation in', async () => {
    const { container } = renderTable();

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
