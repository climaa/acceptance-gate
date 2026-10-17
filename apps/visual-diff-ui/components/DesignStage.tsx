'use client';

import { type ReactNode, useState } from 'react';
import {
  IconButton,
  PanZoom,
  type PanZoomProps,
  type PanZoomRect,
  type PanZoomView,
} from '@gate/ui';
import type { DesignBoard } from '@/lib/comparison';
import type { BoardCrop } from '@/hooks/useBoardCrop';
import { BoardPane, useLocalImage } from './BoardPane';
import type { ReadingRow, Readings } from '@/lib/readings';
import { type ReadingsSubject, SpacingReadings } from './SpacingReadings';

/**
 * A design board — or an image from the reader's own computer — in one pane, a
 * screenshot in the other: the comparison modal's design view, and the whole of
 * a set's shot view.
 *
 * Its own module because it is its own view. Whoever hosts it decides whether it
 * is on show and how it is split; everything inside the two panes is here. The
 * screenshot arrives already described ({@link DesignShot}), so the stage never
 * has to know whether it is the after side of a comparison or one shot of a set.
 */

/** How the design view lays its two panes out: side by side, or the board
 *  stacked over the screenshot. */
export type Split = 'columns' | 'rows';

/** The box toggle's name, pinned the way the upload button's is. */
const BOXES_LABEL = 'show spacing boxes';

/** One box to outline, as `PanZoom` takes it — the type it already owns,
 *  reached through its props rather than re-declared here. */
type Mark = NonNullable<PanZoomProps['marks']>[number];

/** The screenshot pane's subject, as its host names it. */
export interface DesignShot {
  /** The variant key: what the readings must match, and what keys the pane so
   *  a new shot opens fitted rather than at the last one's zoom. */
  key: string;
  /** Where the shot is served, or undefined where there is none to show. */
  src: string | undefined;
  /** The sentence shown in place of a shot that does not exist. */
  absent: string;
  /** The pane's lead: which side or which set this is. */
  caption: string;
  /** The shot's own width in CSS pixels, where the host knows it. */
  width?: number;
  /** The image's alt and the pane's accessible name. */
  alt: string;
  label: string;
}

interface DesignStageProps {
  split: Split;
  /** Lay each pane's own grid over it — counted in that image's pixels. */
  grid: boolean;
  board: DesignBoard;
  onBoard: (board: DesignBoard) => void;
  shot: DesignShot;
  /** The spacing readings for the shot the address was loaded with, read on
   *  the server and handed down — or null where there is no ledger behind it. */
  ledger: Readings | null;
  /** Passed through to the panel: whether it folds, and what it is beside. */
  readingsFolded?: boolean | null;
  subject?: ReadingsSubject;
  /** The shot view's visual-comparison tools; the comparison modal passes none,
   *  and its design view is exactly what it was. */
  tools?: ShotTools;
}

/**
 * What the shot view adds to the stage, for human visual comparison (#540):
 * the two panes holding one view, a crop of the board pinned in the board's
 * pane, and the overlay standing in for both panes.
 */
export interface ShotTools {
  /** Whether the panes hold one view. */
  sync: boolean;
  view: PanZoomView | undefined;
  onViewChange: (view: PanZoomView) => void;
  /** Whether a drag on the board draws a crop. */
  cropping: boolean;
  onCropping: (on: boolean) => void;
  onCrop: (rect: PanZoomRect) => void;
  /** The pinned crop, cut and in CSS pixels, or null for the whole board. */
  crop: BoardCrop | null;
  onClearCrop: () => void;
  /** Drawn in place of both panes: the overlay. */
  overlay: ReactNode | null;
}

/**
 * The readings for the variant on screen, and nothing for any other.
 *
 * Walking the report with ← → writes the address with `history.replaceState`
 * and asks the server for nothing (ComparisonRoute explains why), so the report
 * this component holds goes on being the one the address was LOADED with. Its
 * own `key` is what makes that visible: readings from another variant would be
 * a panel describing one screenshot beside another, with its boxes drawn on the
 * wrong image. The panel says it has no ledger instead, which is the truth about
 * what it was handed.
 */
const readingsFor = (ledger: Readings | null, key: string) =>
  ledger?.key === key ? ledger : null;

/**
 * The boxes the readings point at, one per distinct rect.
 *
 * Four paddings on one element are four rows and ONE outline: `MarksOverlay`
 * draws them in order, so four identical boxes would bury the emphasized one
 * under three plain hairlines. A box is emphasized when the row a reader is
 * pointing at is one of its own — which is how a press on any of that element's
 * rows lights up the same box.
 *
 * Rects arrive in the after screenshot's own pixels, which is the space
 * `PanZoom` draws marks in, so they are handed over as measured.
 */
function marksFor(changes: readonly ReadingRow[], shown: number | null): Mark[] {
  // The rect itself is what tells two readings they are on one element, so its
  // four numbers are the key the boxes are collected under.
  const emphasis = shown === null ? null : (changes[shown]?.rect?.join() ?? null);
  const outlined = new Map<string, Mark>();

  for (const { rect } of changes) {
    if (rect === null) continue;

    const [x, y, width, height] = rect;
    if (x === undefined || y === undefined) continue;
    if (width === undefined || height === undefined) continue;

    const key = rect.join();
    if (!outlined.has(key)) {
      outlined.set(key, { x, y, width, height, emphasis: key === emphasis });
    }
  }

  return [...outlined.values()];
}

/**
 * A design board beside the after screenshot — reference, never a side.
 *
 * The board is a `PanZoom`, keyed by board so a new pick opens at 100% rather
 * than at the last board's zoom. The after side is the same `Shot` the modes
 * draw, so a removed variant says "not on this side" here exactly as it does
 * there. Nothing is compared: the reviewer pans to the tile and judges by eye.
 *
 * Under both panes, one more thing that is reference beside a comparison: the
 * spacing readings, and the boxes on the after screenshot they point at. The
 * two halves are HERE together because the panel's pressed row and the pane's
 * emphasized mark are one state in two places — a row is pointed at, and the
 * box it measures lights up. The panel is a full-width row of its own and never
 * part of the modal's head, which is what keeps the design view free of the
 * `role="toolbar"` an acceptance scenario asserts is absent.
 */
export function DesignStage({
  split,
  grid,
  board,
  onBoard,
  shot,
  ledger,
  readingsFolded = null,
  subject = 'comparison',
  tools,
}: DesignStageProps) {
  const caption = <p className="vd-compare__caption vd-mono">{shot.caption}</p>;
  // An image from the reader's own machine, read in place of a board. Held
  // here — not in the URL, which could never carry a file on someone's disk —
  // so it stays while the arrows walk variants, to be read against each.
  const [local, setLocal] = useLocalImage();
  const pickBoard = (picked: DesignBoard) => {
    setLocal(null);
    if (picked !== board) onBoard(picked);
  };

  // Which reading the boxes answer to: the row a pointer is over while it is
  // there, and the pressed row otherwise. A preview outranks a press, so
  // reading down the panel points at each box in turn without losing the one
  // that was pressed.
  const [pressed, setPressed] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [boxes, setBoxes] = useState(true);

  const readings = readingsFor(ledger, shot.key);
  const marks = marksFor(readings?.rows ?? [], hovered ?? pressed);
  const follow = tools?.sync
    ? { view: tools.view, onViewChange: tools.onViewChange }
    : {};

  return (
    <>
      <div
        className={[
          'vd-compare__stage vd-compare__stage--design',
          tools?.overlay && 'vd-compare__stage--overlay',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {tools?.overlay ?? (
          <div className="vd-compare__design" data-split={split}>
            <div className="vd-compare__column">
              {/* What each pane holds and how it moves share one row, as Board
                  04 draws them: the picker leads the board's own zoom row. */}
              <BoardPane
                board={board}
                local={local}
                grid={grid}
                tools={tools}
                follow={follow}
                onBoard={pickBoard}
                onLocal={setLocal}
              />
            </div>

            <div className="vd-compare__column">
              {/* The same pane as the board's, so the two are read the same way
                  — both fitted at 100%, both dragged and zoomed. A screenshot
                  narrower than the pane sits at its own pixels: the pane never
                  stretches it. */}
              {shot.src === undefined ? (
                <>
                  {caption}
                  <p className="vd-compare__absent">{shot.absent}</p>
                </>
              ) : (
                <PanZoom
                  key={shot.key}
                  src={shot.src}
                  alt={shot.alt}
                  label={shot.label}
                  grid={grid}
                  marks={boxes ? marks : undefined}
                  className="vd-compare__panzoom"
                  lead={caption}
                  {...follow}
                  // On the after pane's own zoom bar, the way the upload button
                  // sits on the board's: it acts on what that pane shows. Offered
                  // only where it has a box to show or hide.
                  actions={
                    marks.length > 0 ? (
                      <IconButton
                        variant="ghost"
                        size="sm"
                        label={BOXES_LABEL}
                        aria-pressed={boxes}
                        onClick={() => setBoxes(!boxes)}
                      >
                        <SquareDashedGlyph />
                      </IconButton>
                    ) : undefined
                  }
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* A full-width row below both panes, as Board 04 draws it — never in the
          modal's head, which is what keeps the design view free of a toolbar. */}
      <SpacingReadings
        ledger={readings}
        pressed={pressed}
        onPress={setPressed}
        onHover={setHovered}
        folded={readingsFolded}
        subject={subject}
      />
    </>
  );
}

/** lucide's `square-dashed`, the glyph Board 04 draws on the box toggle — an
 *  outline of the thing the toggle outlines. */
function SquareDashedGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 3a2 2 0 0 0-2 2" />
      <path d="M19 3a2 2 0 0 1 2 2" />
      <path d="M21 19a2 2 0 0 1-2 2" />
      <path d="M5 21a2 2 0 0 1-2-2" />
      <path d="M9 3h1" />
      <path d="M9 21h1" />
      <path d="M14 3h1" />
      <path d="M14 21h1" />
      <path d="M3 9v1" />
      <path d="M21 9v1" />
      <path d="M3 14v1" />
      <path d="M21 14v1" />
    </svg>
  );
}
