import { Badge, Table, type TableColumn, type TableRow } from '@gate/ui';
import { formatBytes } from '@/lib/outcome';
import type { CaptureSet } from '@/lib/summary';
import { DeleteSetButton } from './ConfirmDialogs';

/**
 * The capture sets this instance holds, newest first — the order `sets.json` is
 * written in.
 *
 * The row is built as data rather than as a component, because the table is
 * data-driven: the cells are what a row is, and the table owns every element
 * around them — including the reflow to a card below 768 px. Keeping the row's
 * vocabulary here is what keeps set/sha/branch/dirty out of `@gate/ui`.
 */

/** The name the acceptance scenario finds this table by. */
const SETS_TABLE_LABEL = 'Snapshot sets';

/** What a set has no measured size for: this instance holds the registry entry
 *  but not the shot tree — a set captured elsewhere, or one whose directory a
 *  human moved. Zero would claim it holds nothing. */
const UNKNOWN = '—';

/** What `git rev-parse --short` gives by default, and what the board draws. */
const SHORT_SHA = 7;

const SET_COLUMNS: readonly TableColumn[] = [
  { header: 'label', truncate: true },
  { header: 'sha' },
  { header: 'branch', truncate: true },
  { header: 'date' },
  { header: 'stories', numeric: true },
  { header: 'size', numeric: true },
  { header: '' },
];

function setRow(set: CaptureSet, bytes: number | undefined): TableRow {
  return {
    key: set.label,
    cells: [
      {
        // Two text nodes, never interpolated: a label is not "main-08-11dirty",
        // and the badge is a mark beside the name rather than part of it. The
        // label gives up its width to the badge rather than the other way
        // round — see `.vd-set` in globals.css.
        content: (
          <span className="vd-set">
            <span className="vd-set__label">{set.label}</span>
            {set.dirty && <Badge tone="warning">dirty</Badge>}
          </span>
        ),
        title: set.label,
      },
      {
        // The board's column is a short sha, and a `sets.json` written with a
        // full one would widen the column past everything beside it. The whole
        // sha stays on `title`, which is what a reviewer copies out.
        content: <span className="vd-mono">{set.sha.slice(0, SHORT_SHA)}</span>,
        title: set.sha,
      },
      { content: set.branch, title: set.branch },
      set.capturedAt,
      // The unit rides with the number, clipped. Below 768 px the row reflows
      // into a card whose per-cell label is `::before` generated content, which
      // is not in the accessibility tree — so without this a reader hears the
      // figure with nothing to say what it counts.
      <>
        {set.stories}
        <span className="ds-visually-hidden">{' stories'}</span>
      </>,
      bytes === undefined ? UNKNOWN : formatBytes(bytes),
      // Named `delete` and nothing more. What it will delete is named by the
      // dialog it opens — D2: nothing here is deleted implicitly, and the row is
      // not where a set's whole identity is repeated.
      <DeleteSetButton label={set.label} key="delete" />,
    ],
  };
}

export interface SetsTableProps {
  sets: readonly CaptureSet[];
  /** Bytes on disk per set label. A set with no entry has no shot tree here —
   *  see lib/data.ts's `readSetSizes`, which measures rather than trusts. */
  sizes: Readonly<Record<string, number>>;
}

export function SetsTable({ sets, sizes }: SetsTableProps) {
  return (
    <Table
      label={SETS_TABLE_LABEL}
      columns={SET_COLUMNS}
      rows={sets.map((set) => setRow(set, sizes[set.label]))}
    />
  );
}
