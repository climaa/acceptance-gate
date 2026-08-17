import type { ReactNode } from 'react';

/**
 * The data table the console's three panels are made of.
 *
 * **This is a stand-in for `@gate/ui`'s `Table` organism (#274), which has not
 * landed yet.** The props below are that issue's pinned API, verbatim —
 * `label`, `columns`, `rows`, the `{ content, title }` cell form — so the three
 * compositions beside this file change one import when the organism arrives and
 * this module is deleted. Nothing visual-diff-shaped is in here, for the same
 * reason it will not be in the organism: the vocabulary lives in the rows.
 *
 * The one thing to get right is the roles. Below 768 px each row reflows into a
 * card, which changes `display` on native table elements — and a browser strips
 * the implicit table/row/cell ARIA roles the moment a `<table>` stops being
 * `display: table`. The e2e contract queries `getByRole('table', { name })` and
 * the row and cell roles at 390 px, where the reflow is active, so every element
 * states its role explicitly and the accessibility tree is the same at every
 * width.
 */

export interface TableColumn {
  /** The column's heading. Empty for an action column, whose cells name
   *  themselves — a header reading "actions" would prefix every reflowed
   *  card's button with a word the button already says. */
  header: string;
  numeric?: boolean;
  truncate?: boolean;
}

/** A cell that truncates carries the full value, so a clipped branch name is
 *  still readable. */
export interface TitledCell {
  content: ReactNode;
  title: string;
}

export type TableCell = ReactNode | TitledCell;

export interface TableRow {
  key: string;
  cells: readonly TableCell[];
}

export interface TableProps {
  /** Becomes `aria-label`. Required: three tables share the console page, and a
   *  reviewer — or a scenario — has to be able to say which one they mean. */
  label: string;
  columns: readonly TableColumn[];
  rows: readonly TableRow[];
  className?: string;
}

/** A React element is an object too, so the discriminant is the pair of keys
 *  rather than `typeof`: no element carries a `content` of its own. */
function isTitled(cell: TableCell): cell is TitledCell {
  return (
    typeof cell === 'object' && cell !== null && 'content' in cell && 'title' in cell
  );
}

function cellClass(column: TableColumn | undefined): string {
  return [
    'vd-table__cell',
    column?.numeric && 'vd-table__cell--numeric',
    column?.truncate && 'vd-table__cell--truncate',
  ]
    .filter(Boolean)
    .join(' ');
}

export function Table({ label, columns, rows, className }: TableProps) {
  return (
    <table
      role="table"
      aria-label={label}
      className={['vd-table', className].filter(Boolean).join(' ')}
    >
      {/* Visually hidden below 768 px rather than `display: none` — the header
          text is what each reflowed card labels its cells with, and removing it
          from the tree would take the column names with it. */}
      <thead role="rowgroup" className="vd-table__head">
        <tr role="row" className="vd-table__row">
          {columns.map((column, index) => (
            // Keyed by position, like the cells below: a column's identity IS
            // its index — that is what aligns a row's cells to it — and an
            // action column's header is deliberately empty.
            <th role="columnheader" scope="col" key={index} className={cellClass(column)}>
              {column.header}
            </th>
          ))}
        </tr>
      </thead>

      <tbody role="rowgroup" className="vd-table__body">
        {rows.map((row) => (
          <tr role="row" key={row.key} className="vd-table__row">
            {row.cells.map((cell, index) => {
              const column = columns[index];

              return (
                <td
                  role="cell"
                  key={index}
                  className={cellClass(column)}
                  // Read back by the reflow as the card's per-cell label. Never
                  // the accessible name — generated content is not in the tree.
                  data-label={column?.header ?? ''}
                  title={isTitled(cell) ? cell.title : undefined}
                >
                  {isTitled(cell) ? cell.content : cell}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
