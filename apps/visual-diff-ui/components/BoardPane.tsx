'use client';

import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import {
  IconButton,
  PanZoom,
  type PanZoomProps,
  SegmentedControl,
  Stack,
} from '@gate/ui';
import {
  DESIGN_BOARDS,
  type DesignBoard,
  designBoardUrl,
  isDesignBoard,
} from '@/lib/comparison';
import type { ShotTools } from './DesignStage';

/**
 * The design view's board pane: a board, an image from the reader's own
 * computer, or — in the shot view — a crop of the board pinned at the
 * screenshot's scale. Its own module because the board's controls (the picker,
 * the upload, the crop) are this pane's alone.
 */

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

/** The crop toggle's name, pinned like the box toggle's. */
const CROP_LABEL = 'crop the board';

interface BoardPaneProps {
  board: DesignBoard;
  local: LocalImage | null;
  grid: boolean;
  tools: ShotTools | undefined;
  /** The shared view, when the panes are synced. */
  follow: Pick<PanZoomProps, 'view' | 'onViewChange' | 'magnify'>;
  onBoard: (board: DesignBoard) => void;
  onLocal: (image: LocalImage) => void;
}

/**
 * The board's pane: a board, the reader's own image, or — in the shot view — a
 * crop of the board pinned at the screenshot's scale, with the way back to the
 * whole board beside it. The crop toggle sits on this pane's zoom row, as the
 * upload button does: both act on what this pane shows.
 */
export function BoardPane({
  board,
  local,
  grid,
  tools,
  follow,
  onBoard,
  onLocal,
}: BoardPaneProps) {
  const crop = local ? null : (tools?.crop ?? null);
  if (crop) {
    return (
      <PanZoom
        key={crop.url}
        src={crop.url}
        alt={`a crop of the ${BOARD_LABELS[board]} design board`}
        label="design board"
        grid={grid}
        className="vd-compare__panzoom"
        lead={<CropLabel board={board} onClear={tools?.onClearCrop} />}
        {...follow}
        // Still on the zoom row, as Board 04 draws it beside a pinned crop:
        // pressing it goes back to the whole board, ready to draw the region
        // again, so a crop can be refined rather than only cleared.
        actions={
          tools && (
            <CropToggle
              on={tools.cropping}
              onToggle={(on) => {
                tools.onCropping(on);
                if (on) tools.onClearCrop();
              }}
            />
          )
        }
      />
    );
  }

  return (
    <PanZoom
      key={local?.url ?? board}
      src={local?.url ?? designBoardUrl(board)}
      alt={
        local ? `your design, ${local.name}` : `the ${BOARD_LABELS[board]} design board`
      }
      label="design board"
      fallback={local ? LOCAL_UNREADABLE : BOARD_UNAVAILABLE}
      grid={grid}
      className="vd-compare__panzoom"
      lead={
        <BoardPicker board={local ? null : board} onBoard={onBoard} local={local?.name} />
      }
      cropping={!local && tools?.cropping}
      onCrop={tools?.onCrop}
      {...follow}
      actions={
        <>
          {tools && !local && (
            <CropToggle on={tools.cropping} onToggle={tools.onCropping} />
          )}
          <UploadDesign onPick={onLocal} />
        </>
      }
    />
  );
}

/** What a pinned crop is, and the way back to the whole board. */
function CropLabel({ board, onClear }: { board: DesignBoard; onClear?: () => void }) {
  return (
    <Stack direction="row" gap={2} align="center">
      <span className="vd-compare__label vd-mono">crop · {BOARD_LABELS[board]}</span>
      {onClear && (
        <IconButton variant="ghost" size="sm" label="clear the crop" onClick={onClear}>
          <XGlyph />
        </IconButton>
      )}
    </Stack>
  );
}

/** The crop toggle: pressed while a drag on the board draws a crop. */
function CropToggle({ on, onToggle }: { on: boolean; onToggle: (on: boolean) => void }) {
  return (
    <IconButton
      variant="ghost"
      size="sm"
      label={CROP_LABEL}
      aria-pressed={on}
      onClick={() => onToggle(!on)}
    >
      <CropGlyph />
    </IconButton>
  );
}

/** lucide's `crop`, the glyph Board 04 draws on the board's zoom row. */
function CropGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M18 22V8a2 2 0 0 0-2-2H2" />
    </svg>
  );
}

/** lucide's `x`, for clearing a crop. */
function XGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
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
        // Named, but held to a few characters: a name long enough to matter
        // would push the zoom controls onto a second row and drop this pane
        // below the screenshot beside it. The whole name is on hover and in
        // the image's alt.
        <span className="vd-compare__label vd-mono" title={local}>
          yours · <span className="vd-compare__local-name">{local}</span>
        </span>
      )}
    </Stack>
  );
}

export interface LocalImage {
  url: string;
  name: string;
}

/**
 * The reader's own image, as an object URL, revoked when it is replaced or the
 * view closes — a file read from disk holds its bytes until it is let go.
 */
export function useLocalImage(): [LocalImage | null, (next: LocalImage | null) => void] {
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
