'use client';

import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { IconButton, PanZoom, SegmentedControl, Stack } from '@gate/ui';
import {
  DESIGN_BOARDS,
  type DesignBoard,
  designBoardUrl,
  isDesignBoard,
} from '@/lib/comparison';
import { absentShotCopy, type ShotSources } from '@/lib/shots';
import type { Variant } from '@/lib/summary';

/**
 * The comparison modal's design view: a design board — or an image from the
 * reader's own computer — in one pane, the after screenshot in the other.
 *
 * Its own module because it is its own view. The modal decides whether it is
 * on show and how it is split; everything inside the two panes is here.
 */

/** How the design view lays its two panes out: side by side, or the board
 *  stacked over the screenshot. */
export type Split = 'columns' | 'rows';

/** How a reader names each board in the picker — what Board 01, 03, 04 and
 *  Flows & Decisions are for, in one word each. */
const BOARD_LABELS: Readonly<Record<DesignBoard, string>> = {
  'component-library': 'components',
  pages: 'pages',
  'visual-diff-pages': 'console',
  'flows-decisions': 'flows',
};

/** The upload button's name, pinned: it is how a scenario presses it. */
const UPLOAD_LABEL = 'compare against an image from your computer';

const LOCAL_UNREADABLE = 'this image could not be read — pick another, or a board';

const BOARD_UNAVAILABLE =
  'this board could not be loaded — it is in designs/exports/ in the checkout';
interface DesignStageProps {
  split: Split;
  /** Lay each pane's own grid over it — counted in that image's pixels. */
  grid: boolean;
  board: DesignBoard;
  onBoard: (board: DesignBoard) => void;
  shots: ShotSources;
  variant: Variant;
  after: string;
}

/**
 * A design board beside the after screenshot — reference, never a side.
 *
 * The board is a `PanZoom`, keyed by board so a new pick opens at 100% rather
 * than at the last board's zoom. The after side is the same `Shot` the modes
 * draw, so a removed variant says "not on this side" here exactly as it does
 * there. Nothing is compared: the reviewer pans to the tile and judges by eye.
 */
export function DesignStage({
  split,
  grid,
  board,
  onBoard,
  shots,
  variant,
  after,
}: DesignStageProps) {
  const afterSrc = shots.candidate;
  const caption = <p className="vd-compare__caption vd-mono">after · {after}</p>;
  // An image from the reader's own machine, read in place of a board. Held
  // here — not in the URL, which could never carry a file on someone's disk —
  // so it stays while the arrows walk variants, to be read against each.
  const [local, setLocal] = useLocalImage();
  const pickBoard = (picked: DesignBoard) => {
    setLocal(null);
    if (picked !== board) onBoard(picked);
  };

  return (
    <div className="vd-compare__stage vd-compare__stage--design">
      <div className="vd-compare__design" data-split={split}>
        <div className="vd-compare__column">
          {/* What each pane holds and how it moves share one row, as Board 04
              draws them: the picker leads the board's own zoom row. */}
          <PanZoom
            key={local?.url ?? board}
            src={local?.url ?? designBoardUrl(board)}
            alt={
              local
                ? `your design, ${local.name}`
                : `the ${BOARD_LABELS[board]} design board`
            }
            label="design board"
            fallback={local ? LOCAL_UNREADABLE : BOARD_UNAVAILABLE}
            grid={grid}
            className="vd-compare__panzoom"
            lead={
              <BoardPicker
                board={local ? null : board}
                onBoard={pickBoard}
                local={local?.name}
              />
            }
            actions={<UploadDesign onPick={setLocal} />}
          />
        </div>

        <div className="vd-compare__column">
          {/* The same pane as the board's, so the two are read the same way —
              both fitted at 100%, both dragged and zoomed. A screenshot narrower
              than the pane sits at its own pixels: the pane never stretches it. */}
          {afterSrc === undefined ? (
            <>
              {caption}
              <p className="vd-compare__absent">{absentShotCopy(variant, 'candidate')}</p>
            </>
          ) : (
            <PanZoom
              key={variant.key}
              src={afterSrc}
              alt="candidate"
              label="after screenshot"
              grid={grid}
              className="vd-compare__panzoom"
              lead={caption}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** The four boards, named the way Board 04 names them — with the word the
 *  group is called by shown before it, not only announced. */
function BoardPicker({
  board,
  onBoard,
  local,
}: {
  /** The board on show, or null while the reader's own image is. */
  board: DesignBoard | null;
  onBoard: (board: DesignBoard) => void;
  /** The name of the reader's own image, while it is the one on show. */
  local?: string;
}) {
  return (
    <Stack direction="row" gap={2} align="center" wrap>
      <span className="vd-compare__label vd-mono" aria-hidden="true">
        board
      </span>
      <SegmentedControl
        label="board"
        options={DESIGN_BOARDS.map((name) => ({
          value: name,
          label: BOARD_LABELS[name],
        }))}
        value={board ?? ''}
        onChange={(picked) => {
          if (isDesignBoard(picked)) onBoard(picked);
        }}
      />
      {local && (
        // Just the word, with the name on hover: a file name long enough to
        // matter would push the zoom controls onto a second row and drop
        // this pane below the screenshot beside it. The image's alt carries
        // the name for a screen reader.
        <span className="vd-compare__label vd-mono" title={local}>
          yours
        </span>
      )}
    </Stack>
  );
}

interface LocalImage {
  url: string;
  name: string;
}

/**
 * The reader's own image, as an object URL, revoked when it is replaced or the
 * view closes — a file read from disk holds its bytes until it is let go.
 */
function useLocalImage(): [LocalImage | null, (next: LocalImage | null) => void] {
  const [local, setLocal] = useState<LocalImage | null>(null);

  useEffect(() => {
    if (!local) return;
    return () => URL.revokeObjectURL(local.url);
  }, [local]);

  return [local, setLocal];
}

/** lucide's `image-up`, the glyph Board 04 draws on the board's zoom row. */
function ImageUpGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.814.014L6 21" />
      <path d="m14 19.5 3-3 3 3" />
      <path d="M17 22v-5.5" />
      <circle cx="9" cy="9" r="2" />
    </svg>
  );
}

/**
 * Read an image from the reader's own computer in place of a board — a design
 * export from any tool, for a story no board draws.
 *
 * The file never leaves the browser: it is shown from an object URL, never
 * uploaded, and never written into the link. A file that is not an image is
 * ignored rather than shown as a broken one.
 */
function UploadDesign({ onPick }: { onPick: (image: LocalImage) => void }) {
  const input = useRef<HTMLInputElement>(null);

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared so picking the same file again still fires a change.
    event.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;

    onPick({ url: URL.createObjectURL(file), name: file.name });
  };

  return (
    <>
      <IconButton
        variant="ghost"
        size="sm"
        label={UPLOAD_LABEL}
        onClick={() => input.current?.click()}
      >
        <ImageUpGlyph />
      </IconButton>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="ds-visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onChange}
      />
    </>
  );
}
