'use client';

import { type KeyboardEvent, useState } from 'react';
import { Button, PAN_ZOOM_STEP, SegmentedControl, Stack } from '@gate/ui';
import { type Nudge, nudged, nudgeText } from '@/lib/board-crop';
import type { BoardCrop } from '@/hooks/useBoardCrop';
import type { DesignShot } from './DesignStage';

/**
 * The shot view's overlay: one pane, the screenshot, with the board crop laid on
 * it at the screenshot's own scale — D7, and the only place a board touches a
 * screenshot. Nothing is compared and nothing is judged; a person reads the
 * drift between the two by eye, so the alignment is theirs, by hand, and the
 * offset stays on screen.
 *
 * Both images are drawn at their CSS pixels times one zoom: the crop arrives
 * already in CSS pixels (hooks/useBoardCrop.ts), so a zoom moves them together.
 * The pane scrolls rather than drags — the arrow keys belong to the nudge.
 */

/** Zoom steps, as PanZoom steps them, from the shot's own size: six steps of
 *  PanZoom's own step, so the two views zoom alike. */
const ZOOMS = Array.from({ length: 6 }, (_, at) => PAN_ZOOM_STEP ** at);

const OPACITY_LABEL = 'board opacity';

/** Which layer the nudge moves. Board 04 draws the toggle first in the row:
 *  choose the layer, then align it. Aligning by moving only the board was hard
 *  when the drift was easier to read off the screenshot. */
type Layer = 'board' | 'shot';

const LAYERS = [
  { value: 'board', label: 'board' },
  { value: 'shot', label: 'screenshot' },
] as const;

/** The nudge as buttons, for a reader with no arrow keys — a phone, a tablet.
 *  Each stands for the arrow key it names, so the step and shift-for-10 are
 *  the keyboard's. */
const NUDGE_BUTTONS = [
  { key: 'ArrowLeft', glyph: '←', name: 'nudge left' },
  { key: 'ArrowUp', glyph: '↑', name: 'nudge up' },
  { key: 'ArrowRight', glyph: '→', name: 'nudge right' },
  { key: 'ArrowDown', glyph: '↓', name: 'nudge down' },
] as const;

const ORIGIN: Nudge = { x: 0, y: 0 };

const NO_CROP =
  'Crop a region of the board to lay it over the screenshot — the whole board is never laid on a single shot.';

export interface OverlayStageProps {
  shot: DesignShot;
  crop: BoardCrop | null;
  /** Asks the host to go back and draw a crop. */
  onAskCrop: () => void;
}

/** The overlay's own zoom: − the readout + and reset. */
function OverlayZoom({ at, onAt }: { at: number; onAt: (at: number) => void }) {
  return (
    <Stack direction="row" gap={1} align="center" className="vd-overlay__zoom">
      <Button
        variant="ghost"
        size="sm"
        aria-label="zoom out"
        disabled={at === 0}
        onClick={() => onAt(at - 1)}
      >
        −
      </Button>
      <span className="vd-overlay__readout vd-mono">
        {Math.round((ZOOMS[at] ?? 1) * 100)}%
      </span>
      <Button
        variant="ghost"
        size="sm"
        aria-label="zoom in"
        disabled={at === ZOOMS.length - 1}
        onClick={() => onAt(at + 1)}
      >
        +
      </Button>
    </Stack>
  );
}

export function OverlayStage({ shot, crop, onAskCrop }: OverlayStageProps) {
  const [zoomAt, setZoomAt] = useState(0);
  // The screenshot's own size, read off it once it loads: a capture is one
  // device pixel per CSS pixel, so its natural size IS its CSS size.
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [opacity, setOpacity] = useState(50);
  const [moving, setMoving] = useState<Layer>('board');
  const [nudges, setNudges] = useState<Record<Layer, Nudge>>({
    board: ORIGIN,
    shot: ORIGIN,
  });
  const nudge = nudges[moving];
  const zoom = ZOOMS[zoomAt] ?? 1;

  /** Moves the chosen layer as an arrow key would; false for any other key. */
  const nudgeBy = (key: string, shift: boolean) => {
    const next = crop && nudged(nudge, key, shift);
    if (!next) return false;

    setNudges((all) => ({ ...all, [moving]: next }));
    return true;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!nudgeBy(event.key, event.shiftKey)) return;

    // Claimed from the scroll and from any walk listening above: an arrow here
    // moves the chosen layer and nothing else.
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div className="vd-overlay">
      <Stack direction="row" gap={3} align="center" className="vd-overlay__bar">
        <p className="vd-compare__caption vd-mono">{shot.caption} · board crop over it</p>
        <OverlayZoom at={zoomAt} onAt={setZoomAt} />
      </Stack>

      <div
        // PanZoom's pane frame, so switching to the overlay moves nothing; the
        // overlay's own class undoes only what a dragged pane needs.
        className="ds-panzoom__pane vd-overlay__pane"
        role="group"
        aria-label="the screenshot with the board crop over it"
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <div
          className="vd-overlay__layers"
          // Past the shot's own pixels, each pixel draws as a square, as a
          // magnified PanZoom does (#547).
          data-magnified={zoom > 1 ? '' : undefined}
          style={
            size
              ? { width: `${size.width * zoom}px`, height: `${size.height * zoom}px` }
              : undefined
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- the pixels
              are the evidence; next/image would resample them. */}
          <img
            className="vd-overlay__shot"
            src={shot.src}
            alt={shot.alt}
            style={{
              left: `${nudges.shot.x * zoom}px`,
              top: `${nudges.shot.y * zoom}px`,
            }}
            onLoad={(event) =>
              setSize({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
          />
          {crop && (
            // eslint-disable-next-line @next/next/no-img-element -- as above.
            <img
              className="vd-overlay__crop"
              src={crop.url}
              alt=""
              aria-hidden="true"
              style={{
                left: `${nudges.board.x * zoom}px`,
                top: `${nudges.board.y * zoom}px`,
                width: `${crop.width * zoom}px`,
                opacity: opacity / 100,
              }}
            />
          )}
        </div>
      </div>

      {crop ? (
        <Stack
          direction="row"
          gap={3}
          align="center"
          wrap
          className="vd-overlay__controls"
        >
          <Stack direction="row" gap={2} align="center">
            <span className="vd-overlay__label vd-mono" aria-hidden="true">
              moves
            </span>
            <SegmentedControl
              label="moves"
              options={LAYERS}
              value={moving}
              onChange={(value) => setMoving(value as Layer)}
            />
          </Stack>
          <label className="vd-overlay__label vd-mono">
            board
            <input
              type="range"
              min={0}
              max={100}
              value={opacity}
              aria-label={OPACITY_LABEL}
              onChange={(event) => setOpacity(Number(event.target.value))}
            />
          </label>
          <p className="vd-compare__caption vd-mono" aria-live="polite">
            {opacity}% · ←↑→↓ nudge 1px · shift 10px · offset {nudgeText(nudge)}
          </p>
          <Stack direction="row" gap={1} align="center">
            {NUDGE_BUTTONS.map(({ key, glyph, name }) => (
              <Button
                key={key}
                variant="secondary"
                size="sm"
                aria-label={name}
                onClick={(event) => nudgeBy(key, event.shiftKey)}
              >
                {glyph}
              </Button>
            ))}
          </Stack>
        </Stack>
      ) : (
        <Stack
          direction="row"
          gap={3}
          align="center"
          wrap
          className="vd-overlay__controls"
        >
          <p className="vd-compare__caption">{NO_CROP}</p>
          <Button variant="secondary" size="sm" onClick={onAskCrop}>
            crop the board
          </Button>
        </Stack>
      )}
    </div>
  );
}
