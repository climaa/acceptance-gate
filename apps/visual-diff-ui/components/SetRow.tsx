import { Badge, Button } from '@gate/ui';
import { formatBytes } from '@/lib/outcome';
import type { CaptureSet } from '@/lib/summary';
import type { TableColumn, TableRow } from './Table';

/**
 * One capture set as a table row.
 *
 * A row builder rather than a component, because the table is data-driven: the
 * cells are what a row is, and the table owns every element around them —
 * including the reflow to a two-line card below 768 px. Keeping the row's
 * vocabulary here is what keeps set/sha/branch/dirty out of `@gate/ui`.
 */

/** What a set has no measured size for: this instance holds the registry entry
 *  but not the shot tree — a set captured elsewhere, or one whose directory a
 *  human moved. Zero would claim it holds nothing. */
const UNKNOWN = '—';

/** What `git rev-parse --short` gives by default, and what the board draws. */
const SHORT_SHA = 7;

export const SET_COLUMNS: readonly TableColumn[] = [
  { header: 'label', truncate: true },
  { header: 'sha' },
  { header: 'branch', truncate: true },
  { header: 'date' },
  { header: 'stories', numeric: true },
  { header: 'size', numeric: true },
  { header: '' },
];

export function setRow(set: CaptureSet, bytes: number | undefined): TableRow {
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
      set.stories,
      bytes === undefined ? UNKNOWN : formatBytes(bytes),
      // Named `delete` and nothing more: the confirm dialog and the endpoint
      // arrive with the run-panel issue, and a button that says what it will
      // delete belongs on that dialog, not here.
      <Button variant="danger" size="sm" key="delete">
        delete
      </Button>,
    ],
  };
}
