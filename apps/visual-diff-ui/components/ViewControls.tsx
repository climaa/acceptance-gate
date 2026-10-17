import { IconButton } from '@gate/ui';
import type { Split } from './DesignStage';

/**
 * How a design view is being looked at: side by side or stacked, and with a grid
 * or without. Shared by the comparison modal's design view and the shot view,
 * so the two read the same way and name their buttons the same — the names are
 * how the acceptance suite presses them.
 *
 * Ways of looking, never things to point someone at: neither is in the URL, and
 * the host holds both.
 */

const SPLIT_LABELS: Readonly<Record<Split, string>> = {
  columns: 'stack the board over the screenshot',
  rows: 'put the board beside the screenshot',
};

/** lucide's `rows-2` and `columns-2`: each button draws the layout it switches
 *  TO, which is what its name says too. Stroked, sized by
 *  `.ds-icon-btn__glyph`, tinted by `currentColor`. */
function SplitGlyph({ to }: { to: Split }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d={to === 'rows' ? 'M3 12h18' : 'M12 3v18'} />
    </svg>
  );
}

/** lucide's `grid-3x3`, for the toggle that lays a grid over both panes. */
function GridGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M3 9h18" />
      <path d="M3 15h18" />
      <path d="M9 3v18" />
      <path d="M15 3v18" />
    </svg>
  );
}

export interface ViewControlsProps {
  /** The layout on show, or null where the split toggle is not offered: below
   *  the breakpoint, where the panes stack whatever was picked. */
  layout: Split | null;
  onLayout: (layout: Split) => void;
  /** Whether the grid is on, or null where it is not offered. */
  grid: boolean | null;
  onGrid: (grid: boolean) => void;
}

export function ViewControls({ layout, onLayout, grid, onGrid }: ViewControlsProps) {
  return (
    <>
      {layout && (
        <IconButton
          variant="ghost"
          label={SPLIT_LABELS[layout]}
          onClick={() => onLayout(layout === 'columns' ? 'rows' : 'columns')}
        >
          <SplitGlyph to={layout === 'columns' ? 'rows' : 'columns'} />
        </IconButton>
      )}

      {/* A toggle, so pressed rather than renamed: the grid is on or off,
          where the split button names the layout it is about to make. */}
      {grid !== null && (
        <IconButton
          variant="ghost"
          label="grid"
          aria-pressed={grid}
          onClick={() => onGrid(!grid)}
        >
          <GridGlyph />
        </IconButton>
      )}
    </>
  );
}
