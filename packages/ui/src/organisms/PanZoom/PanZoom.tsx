'use client';

import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type SyntheticEvent,
  useEffect,
  useRef,
  useState,
} from 'react';

import { Button } from '../../atoms/Button/Button';

/**
 * One image in a pane that clips it, moved by dragging and zoomed by steps.
 *
 * **100% is the image fitted to the pane's width, and it is the floor.** A board
 * many times wider than the screen is read by zooming into it, never out of it:
 * there is nothing to see below "all of it, as wide as the pane". `+` steps by
 * {@link ZOOM_STEP} up to the image's natural pixels — past that, a zoom would
 * be inventing pixels — and `reset` returns to 100% at the top-left.
 *
 * Fitted, never stretched: an image narrower than the pane sits at its own
 * pixels at 100%, because 100% already shows it whole, and a screenshot drawn
 * wider than it was captured is a blurred claim about the capture.
 *
 * Panning is clamped so the image never leaves the pane showing nothing: a pan
 * stops where an edge of the image meets an edge of the pane. An image taller
 * than the pane (every design board, at 100%) pans vertically from the start.
 *
 * Focused, the arrow keys pan and the event is consumed — `preventDefault` — so
 * a listener further up, like a dialog's ← → walk, stands down while the pane
 * owns the keys. `+`/`-` zoom and `0` resets. Pointer events cover mouse, pen
 * and touch alike, with `touch-action: none` on the pane so a drag pans the
 * image rather than the page. Nothing animates.
 *
 * It knows nothing about what it shows: the caller hands it a `src`, an `alt`
 * and a `label`.
 */

/** How far one `+` or `−` moves the zoom. */
export const ZOOM_STEP = 1.5;

/** How far one arrow key pans, as a share of the pane. */
export const PAN_STEP = 0.1;

export interface Size {
  width: number;
  height: number;
}

export interface Offset {
  x: number;
  y: number;
}

const ORIGIN: Offset = { x: 0, y: 0 };

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/** The highest zoom there is: the image at its natural pixels. An image no
 *  wider than the pane cannot be zoomed at all — 100% already shows it whole. */
export const zoomCap = (naturalWidth: number, paneWidth: number) =>
  paneWidth > 0 && naturalWidth > paneWidth ? naturalWidth / paneWidth : 1;

/** One step in or out, never below 100% nor above the cap. A step that lands
 *  within a hair of 100% lands on it, so the floor is reachable by stepping. */
export function stepZoom(zoom: number, direction: 1 | -1, cap: number): number {
  const next = direction > 0 ? zoom * ZOOM_STEP : zoom / ZOOM_STEP;

  return next < 1.01 ? 1 : clamp(next, 1, cap);
}

/** The image's width at 100%: the pane's, or its own when it is narrower —
 *  fitted, never stretched. The pane's until the image has reported a size. */
export const fitWidth = (naturalWidth: number, paneWidth: number) =>
  naturalWidth > 0 ? Math.min(naturalWidth, paneWidth) : paneWidth;

/** The image's drawn size at a zoom: its 100% width times the zoom, and as tall
 *  as its own proportions make that. */
export const drawnSize = (pane: Size, natural: Size, zoom: number): Size => {
  const width = fitWidth(natural.width, pane.width) * zoom;
  const ratio = natural.width > 0 ? natural.height / natural.width : 0;

  return { width, height: width * ratio };
};

/** An offset the image can actually sit at: never further right or down than
 *  the pane's top-left, never so far the other way that the pane shows past the
 *  image's far edge. */
export function clampOffset(offset: Offset, pane: Size, image: Size): Offset {
  return {
    x: clamp(offset.x, Math.min(0, pane.width - image.width), 0),
    y: clamp(offset.y, Math.min(0, pane.height - image.height), 0),
  };
}

/** The offset that keeps the point under `anchor` where it is while the zoom
 *  moves from `from` to `to` — zooming into what is in the middle of the pane,
 *  not into its corner. */
export function zoomAbout(
  offset: Offset,
  from: number,
  to: number,
  anchor: Offset,
): Offset {
  const k = to / from;

  return {
    x: anchor.x - (anchor.x - offset.x) * k,
    y: anchor.y - (anchor.y - offset.y) * k,
  };
}

/** What a key does to the pane, or null for a key the pane leaves alone. */
type KeyAction = { pan: Offset } | { zoom: 1 | -1 } | { reset: true };

const KEY_ACTIONS: Readonly<Record<string, KeyAction>> = {
  ArrowLeft: { pan: { x: 1, y: 0 } },
  ArrowRight: { pan: { x: -1, y: 0 } },
  ArrowUp: { pan: { x: 0, y: 1 } },
  ArrowDown: { pan: { x: 0, y: -1 } },
  '+': { zoom: 1 },
  '=': { zoom: 1 },
  '-': { zoom: -1 },
  _: { zoom: -1 },
  '0': { reset: true },
};

export interface PanZoomProps {
  src: string;
  /** What the image is, for a reader who cannot see it. */
  alt: string;
  /** The pane's accessible name — the thing a reader is moving around in. */
  label: string;
  /** Where the zoom starts, clamped to the floor and the cap once the image's
   *  size is known. For a caller that opens on a detail; 1 otherwise. */
  defaultZoom?: number;
  /** What the pane says when the image cannot be loaded — a sentence, never a
   *  broken image. Every zoom control disables with it: there is nothing to
   *  move. Tracked per `src`, so pointing the pane at another image recovers. */
  fallback?: ReactNode;
  className?: string;
}

/** The pane's measured size, kept current as the pane resizes. */
function usePaneSize(): [React.RefObject<HTMLDivElement | null>, Size] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const pane = ref.current;
    if (!pane) return;

    const measure = () => setSize({ width: pane.clientWidth, height: pane.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

export function PanZoom({
  src,
  alt,
  label,
  defaultZoom = 1,
  fallback,
  className,
}: PanZoomProps) {
  const [paneRef, pane] = usePaneSize();
  const [natural, setNatural] = useState<Size>({ width: 0, height: 0 });
  const [requested, setRequested] = useState(defaultZoom);
  const [rawOffset, setOffset] = useState<Offset>(ORIGIN);
  const drag = useRef<{ pointer: Offset; from: Offset } | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === src;

  const cap = zoomCap(natural.width, pane.width);
  const zoom = clamp(requested, 1, cap);
  const image = drawnSize(pane, natural, zoom);
  const offset = clampOffset(rawOffset, pane, image);
  const center = { x: pane.width / 2, y: pane.height / 2 };

  const zoomTo = (next: number) => {
    setOffset(zoomAbout(offset, zoom, next, center));
    setRequested(next);
  };
  const step = (direction: 1 | -1) => zoomTo(stepZoom(zoom, direction, cap));
  const reset = () => {
    setRequested(1);
    setOffset(ORIGIN);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const action = KEY_ACTIONS[event.key];
    if (!action) return;

    event.preventDefault();
    if ('reset' in action) return reset();
    if ('zoom' in action) return step(action.zoom);
    setOffset({
      x: offset.x + action.pan.x * pane.width * PAN_STEP,
      y: offset.y + action.pan.y * pane.height * PAN_STEP,
    });
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { pointer: { x: event.clientX, y: event.clientY }, from: offset };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;

    setOffset({
      x: start.from.x + event.clientX - start.pointer.x,
      y: start.from.y + event.clientY - start.pointer.y,
    });
  };
  const endDrag = () => {
    drag.current = null;
  };

  const onLoad = (event: SyntheticEvent<HTMLImageElement>) =>
    setNatural({
      width: event.currentTarget.naturalWidth,
      height: event.currentTarget.naturalHeight,
    });

  const atRest = failed || (zoom === 1 && offset.x === 0 && offset.y === 0);

  return (
    <div className={['ds-panzoom', className].filter(Boolean).join(' ')}>
      <div className="ds-panzoom__controls" role="group" aria-label={`${label} zoom`}>
        <Button
          variant="ghost"
          size="sm"
          aria-label="zoom out"
          disabled={failed || zoom <= 1}
          onClick={() => step(-1)}
        >
          −
        </Button>
        <span className="ds-panzoom__readout">{Math.round(zoom * 100)}%</span>
        <Button
          variant="ghost"
          size="sm"
          aria-label="zoom in"
          disabled={failed || zoom >= cap}
          onClick={() => step(1)}
        >
          +
        </Button>
        <Button variant="ghost" size="sm" disabled={atRest} onClick={reset}>
          reset
        </Button>
      </div>

      {/* A focusable group rather than an interactive role: the pane is moved
          around in, with keys it documents above, and the buttons are the
          zoom's accessible path for every reader. */}
      <div
        ref={paneRef}
        className="ds-panzoom__pane"
        role="group"
        aria-label={label}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {failed ? (
          <p className="ds-panzoom__fallback">{fallback}</p>
        ) : (
          <img
            className="ds-panzoom__image"
            src={src}
            alt={alt}
            draggable={false}
            onLoad={onLoad}
            onError={() => setFailedSrc(src)}
            style={{
              // Pixels once both sizes are known, so a narrow image is never
              // stretched; the pane's width until then.
              width: natural.width > 0 && pane.width > 0 ? `${image.width}px` : '100%',
              transform: `translate(${offset.x}px, ${offset.y}px)`,
            }}
          />
        )}
      </div>
    </div>
  );
}
