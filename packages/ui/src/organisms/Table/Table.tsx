import { isValidElement, type ReactNode } from 'react';

export interface TableColumn {
  /** The column's name. Drawn in the header row, and repeated on every body cell
   *  as `data-label` so the mobile card layout can label its lines. */
  header: string;
  /** Tabular figures, right-aligned and set in the mono face — the column reads as
   *  a stack of comparable numbers rather than as prose that happens to be digits. */
  numeric?: boolean;
  /** One line, ellipsized. Pair with the object cell form: the ellipsis hides the
   *  end of the value, and `title` is what gives it back. */
  truncate?: boolean;
  /**
   * A CSS length for this column, landing on a `<col>`.
   *
   * `table-layout: fixed` divides the width evenly and then refuses to grow a
   * cell for its content, so a column holding a control rather than text needs to
   * say how much room that control takes — otherwise it is allotted a share of
   * the table and the control breaks out of its own cell. Columns that do not
   * declare one share whatever is left, which is the behaviour text columns want.
   */
  width?: string;
}

/** The object form of a cell. Any cell may use it; a truncating column's should. */
export interface TitledCell {
  content: ReactNode;
  /** The full, untruncated value, landing on the cell's `title` attribute. */
  title: string;
}

export type TableCell = ReactNode | TitledCell;

export interface TableRow {
  /** React's key for the row. The caller owns identity — a row's position is not
   *  it, and re-sorting a table keyed by index re-renders every row. */
  key: string;
  /** Positional: cell *i* belongs to column *i*. */
  cells: readonly TableCell[];
}

export interface TableProps {
  /**
   * The table's accessible name, landing on `aria-label`. Required, not optional:
   * two tables share the visual-diff console page, and an unnamed one is reachable
   * only as "table" — indistinguishable from its neighbour to anyone driving the
   * page by role.
   */
  label: string;
  columns: readonly TableColumn[];
  rows: readonly TableRow[];
  className?: string;
}

/**
 * A React element is an object as well, so a bare `typeof cell === 'object'` would
 * read `<em>…</em>` as the titled form and render `[object Object]`. Elements are
 * excluded first; what is left and carries a `title` is the object form.
 */
const isTitled = (cell: TableCell): cell is TitledCell =>
  typeof cell === 'object' &&
  cell !== null &&
  !isValidElement(cell) &&
  'title' in cell &&
  'content' in cell;

/** `ds-table__cell` plus whatever the column asks for. A header cell takes the same
 *  modifiers as the body cells under it, so the column reads as one. */
const cellClass = (column: TableColumn | undefined) =>
  [
    'ds-table__cell',
    column?.numeric ? 'ds-table__cell--numeric' : undefined,
    column?.truncate ? 'ds-table__cell--truncate' : undefined,
  ]
    .filter(Boolean)
    .join(' ');

/**
 * The design system's generic data table: a header row, ruled rows, numeric and
 * truncating columns, and a reflow to cards below 768px. It knows nothing about
 * what it is listing — the compositions that do (the visual-diff console's sets
 * and history tables) live in the app that owns that vocabulary.
 *
 * Every element carries an explicit `role`, which is the one thing about this
 * component that is not decoration. The reflow changes `display` on native table
 * elements, and a browser strips the implicit table/rowgroup/row/cell roles the
 * moment a `<table>` stops being `display: table` — so at 390px an implicitly
 * roled table is a stack of anonymous `<div>`-alikes to a screen reader, and every
 * `getByRole('table', …)` in the console's e2e contract fails on the mobile
 * project alone. Stating the roles keeps the accessibility tree identical at every
 * width. jsdom resolves implicit roles whatever the CSS says, so a unit test can
 * only see this as an attribute; Table.test.tsx asserts it that way.
 */
export function Table({ label, columns, rows, className }: TableProps) {
  return (
    <table
      role="table"
      aria-label={label}
      className={['ds-table', className].filter(Boolean).join(' ')}
    >
      {/* Only when a column asked for a width: an all-`<col>`-no-width colgroup
          would be markup that changes nothing. `<col>` carries no ARIA role and
          renders no box, so it is invisible to both the accessibility tree and
          the card layout below the breakpoint. */}
      {columns.some((column) => column.width) && (
        <colgroup>
          {columns.map((column, index) => (
            <col key={index} style={column.width ? { width: column.width } : undefined} />
          ))}
        </colgroup>
      )}

      <thead role="rowgroup" className="ds-table__head">
        <tr role="row" className="ds-table__row">
          {columns.map((column, index) => (
            <th
              key={index}
              role="columnheader"
              scope="col"
              className={`${cellClass(column)} ds-table__cell--header`}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody role="rowgroup" className="ds-table__body">
        {rows.map((row) => (
          <tr key={row.key} role="row" className="ds-table__row">
            {row.cells.map((cell, index) => {
              const column = columns[index];
              const titled = isTitled(cell);

              return (
                <td
                  key={index}
                  role="cell"
                  className={cellClass(column)}
                  data-label={column?.header}
                  title={titled ? cell.title : undefined}
                >
                  {titled ? cell.content : cell}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
