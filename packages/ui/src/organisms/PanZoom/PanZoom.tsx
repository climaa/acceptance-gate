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
 * and a `label` — and, when it has boxes to point at, their {@link Mark}s.
 *
 * **Handed a `view`, it follows it** rather than keeping its own: the zoom and
 * where the image sits come from the host, and every change is reported through
 * `onViewChange` instead of kept. Two panes handed one view move as one. Handed
 * none, it keeps its own exactly as before — and still reports, for a host that
 * only wants to listen.
 *
 * **Asked to crop**, a drag draws a rectangle instead of panning, and its box in
 * the image's own pixels is reported through `onCrop` on release. It never keeps
 * the crop: a host that wants it shown hands it back as `crop`.
 */

/** How far one `+` or `−` moves the zoom. */
export const ZOOM_STEP = 1.5;

/** The grid's possible steps, in the image's own pixels: the 4-pixel unit the
 *  system spaces by, doubled up to a size a board's tiles are laid out on. */
export const GRID_STEPS = [4, 8, 16, 32, 64, 128, 256, 512, 1024] as const;

/** The closest two grid lines may sit on screen before they stop being a grid
 *  and start being a texture. */
export const MIN_GRID_GAP = 12;

const COARSEST_GRID = 1024;

/**
 * The grid's step at a scale (drawn pixels per image pixel): the finest step
 * whose lines land at least {@link MIN_GRID_GAP} screen pixels apart. So the
 * grid follows the zoom — coarse over a whole board at 100%, finer as `+` gets
 * closer — while always counting the image's pixels, never the screen's, which
 * is what lets a design and a screenshot be measured against each other.
 */
export function gridStep(scale: number): number {
  return GRID_STEPS.find((step) => step * scale >= MIN_GRID_GAP) ?? COARSEST_GRID;
}

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

/** A box to outline on the image, in the image's own pixels — the same space a
 *  screenshot's element rects are measured in, so a caller hands them over as
 *  measured. An emphasized mark is the one the reader is pointing at. */
export interface Mark {
  x: number;
  y: number;
  width: number;
  height: number;
  emphasis?: boolean;
}

/** A box in the image's own pixels, with nothing to say about emphasis. */
export type Rect = Omit<Mark, 'emphasis'>;

/**
 * Where a pane is looking: its zoom, and the point of the image at the pane's
 * top-left as a share of the drawn image — 0 to 1 on each axis.
 *
 * A share rather than pixels, because pixels of one pane mean nothing in
 * another: two panes holding images of different sizes, in panes of different
 * widths, can hold the same view and show the same part of each.
 */
export interface View {
  zoom: number;
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

/** A view read off a zoom and an offset, at the size the image is drawn at it. */
export function viewOf(zoom: number, offset: Offset, image: Size): View {
  return {
    zoom,
    // `0 - x` rather than `-x`: a pane at rest reports 0, never -0.
    x: image.width > 0 ? (0 - offset.x) / image.width : 0,
    y: image.height > 0 ? (0 - offset.y) / image.height : 0,
  };
}

/** The offset a view puts the image at, at the size it is drawn at. */
export const offsetOf = (view: View, image: Size): Offset => ({
  x: -view.x * image.width,
  y: -view.y * image.height,
});

/**
 * The box between two points of the pane, in the image's own pixels: unshifted
 * by the offset, unscaled by the zoom, and held inside the image. Null for a box
 * with no area — a click is not a crop.
 */
export function cropRect(
  from: Offset,
  to: Offset,
  offset: Offset,
  scale: number,
  natural: Size,
): Rect | null {
  if (scale <= 0) return null;

  const toImage = (point: Offset) => ({
    x: clamp((point.x - offset.x) / scale, 0, natural.width),
    y: clamp((point.y - offset.y) / scale, 0, natural.height),
  });
  const a = toImage(from);
  const b = toImage(to);
  const rect = {
    x: Math.round(Math.min(a.x, b.x)),
    y: Math.round(Math.min(a.y, b.y)),
    width: Math.round(Math.abs(b.x - a.x)),
    height: Math.round(Math.abs(b.y - a.y)),
  };

  return rect.width < 1 || rect.height < 1 ? null : rect;
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
  /** Lay a grid over the image, counted in the image's own pixels — see
   *  {@link gridStep}. Off unless asked for. */
  grid?: boolean;
  /** Boxes to outline on the image, moved and scaled with it — see {@link Mark}.
   *  No marks, no layer. */
  marks?: readonly Mark[];
  /** Drawn at the start of the control row, with the zoom controls pushed to
   *  its end — a caller's picker or caption, so the row above the pane says
   *  what is in it and how to move it on one line. */
  lead?: ReactNode;
  /** Drawn among the zoom controls, after `reset` — a caller's own control
   *  that acts on what the pane shows. */
  actions?: ReactNode;
  /** The view to follow — see {@link View}. Absent, the pane keeps its own. */
  view?: View;
  /** Every change of view: a step, a pan, a drag, a reset. */
  onViewChange?: (view: View) => void;
  /** Whether a drag draws a crop rather than panning. */
  cropping?: boolean;
  /** A crop to show, in the image's own pixels — the host's to keep. */
  crop?: Rect | null;
  /** A finished crop, in the image's own pixels. */
  onCrop?: (rect: Rect) => void;
  className?: string;
}

interface GridOverlayProps {
  image: Size;
  offset: Offset;
  /** The grid's step, in drawn pixels. */
  gap: number;
}

/** The grid, sized and moved exactly as the image is, so its lines stay on the
 *  image's pixels while it pans and zooms. Decoration only: the step it draws is
 *  said in words beside the zoom readout. */
function GridOverlay({ image, offset, gap }: GridOverlayProps) {
  return (
    <div
      aria-hidden="true"
      className="ds-panzoom__grid"
      style={
        {
          width: `${image.width}px`,
          height: `${image.height}px`,
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          '--ds-panzoom-grid-gap': `${gap}px`,
        } as React.CSSProperties
      }
    />
  );
}

interface MarksOverlayProps {
  marks: readonly Mark[];
  image: Size;
  offset: Offset;
  /** Drawn pixels per image pixel. */
  scale: number;
}

/** The marks, in a layer sized and moved exactly as the image is — the grid's
 *  arrangement — with each box scaled from the image's pixels to drawn ones.
 *  Decoration only: whoever hands the marks over says in words what they are. */
function MarksOverlay({ marks, image, offset, scale }: MarksOverlayProps) {
  return (
    <div
      aria-hidden="true"
      className="ds-panzoom__marks"
      style={{
        width: `${image.width}px`,
        height: `${image.height}px`,
        transform: `translate(${offset.x}px, ${offset.y}px)`,
      }}
    >
      {marks.map((mark, index) => (
        <div
          // Marks carry no identity of their own, and the list is redrawn whole.
          key={index}
          className={['ds-panzoom__mark', mark.emphasis && 'ds-panzoom__mark--emphasis']
            .filter(Boolean)
            .join(' ')}
          style={{
            left: `${mark.x * scale}px`,
            top: `${mark.y * scale}px`,
            width: `${mark.width * scale}px`,
            height: `${mark.height * scale}px`,
          }}
        />
      ))}
    </div>
  );
}

/** A box on the pane, in its own coordinates — a crop being drawn, or a kept
 *  one placed where the image now is. Decoration: the crop is reported, not
 *  read off the screen. */
function CropBox({ rect }: { rect: Rect }) {
  return (
    <div
      aria-hidden="true"
      className="ds-panzoom__crop"
      style={{
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      }}
    />
  );
}

/** The box between two pane points, in pane coordinates. */
const between = (from: Offset, to: Offset): Rect => ({
  x: Math.min(from.x, to.x),
  y: Math.min(from.y, to.y),
  width: Math.abs(to.x - from.x),
  height: Math.abs(to.y - from.y),
});

/** A kept crop, from the image's pixels to where it is drawn on the pane now. */
const onPane = (rect: Rect, offset: Offset, scale: number): Rect => ({
  x: rect.x * scale + offset.x,
  y: rect.y * scale + offset.y,
  width: rect.width * scale,
  height: rect.height * scale,
});

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

interface ZoomControlsProps {
  label: string;
  zoom: number;
  canZoomOut: boolean;
  canZoomIn: boolean;
  canReset: boolean;
  /** The grid's step in image pixels, or null when no grid is drawn. */
  gridEvery: number | null;
  actions?: ReactNode;
  onStep: (direction: 1 | -1) => void;
  onReset: () => void;
}

/** − the readout + and reset, and the grid's step in words when there is one. */
function ZoomControls({
  label,
  zoom,
  canZoomOut,
  canZoomIn,
  canReset,
  gridEvery,
  actions,
  onStep,
  onReset,
}: ZoomControlsProps) {
  return (
    <div className="ds-panzoom__controls" role="group" aria-label={`${label} zoom`}>
      <Button
        variant="ghost"
        size="sm"
        aria-label="zoom out"
        disabled={!canZoomOut}
        onClick={() => onStep(-1)}
      >
        −
      </Button>
      <span className="ds-panzoom__readout">{Math.round(zoom * 100)}%</span>
      <Button
        variant="ghost"
        size="sm"
        aria-label="zoom in"
        disabled={!canZoomIn}
        onClick={() => onStep(1)}
      >
        +
      </Button>
      <Button variant="ghost" size="sm" disabled={!canReset} onClick={onReset}>
        reset
      </Button>
      {actions}
      {gridEvery !== null && (
        <span className="ds-panzoom__grid-step">grid {gridEvery} px</span>
      )}
    </div>
  );
}

interface ControlsInput {
  failed: boolean;
  zoom: number;
  cap: number;
  offset: Offset;
  grid: boolean;
  natural: Size;
  image: Size;
}

/** Which controls are live, and the grid's step when one is drawn — every
 *  either-or the render would otherwise make inline. */
function controlsFor({ failed, zoom, cap, offset, grid, natural, image }: ControlsInput) {
  const atRest = zoom === 1 && offset.x === 0 && offset.y === 0;
  // Drawn pixels per image pixel, once the image has said how big it is.
  const scale = natural.width > 0 ? image.width / natural.width : 0;

  return {
    canZoomOut: !failed && zoom > 1,
    canZoomIn: !failed && zoom < cap,
    canReset: !failed && !atRest,
    scale,
    gridEvery: grid && !failed && scale > 0 ? gridStep(scale) : null,
  };
}

/** A crop being drawn: where the drag began and where it is now, on the pane. */
interface Draft {
  from: Offset;
  to: Offset;
}

/** A point of the pane under the pointer, in the pane's own coordinates. */
function panePoint(event: PointerEvent<HTMLDivElement>): Offset {
  const box = event.currentTarget.getBoundingClientRect();

  return { x: event.clientX - box.left, y: event.clientY - box.top };
}

/** The draft the keyboard starts: the middle half of the pane. */
const centredDraft = (pane: Size): Draft => ({
  from: { x: pane.width / 4, y: pane.height / 4 },
  to: { x: (pane.width * 3) / 4, y: (pane.height * 3) / 4 },
});

interface CropDraftInput {
  /** Whether a drag draws a crop at all. */
  enabled: boolean;
  pane: Size;
  /** A draft let go of — whether it has an area is the caller's to judge. */
  onFinish: (done: Draft) => void;
}

/**
 * The crop being drawn, and the gestures that draw it: a drag, or from the
 * keyboard Enter to start the middle half of the pane, the arrows to move its
 * far corner, Enter to finish and Escape to drop it.
 *
 * Kept apart from the pane's view, which a crop never moves.
 */
function useCropDraft({ enabled, pane, onFinish }: CropDraftInput) {
  const [draft, setDraft] = useState<Draft | null>(null);

  const finish = (done: Draft) => {
    setDraft(null);
    onFinish(done);
  };

  const resize = (current: Draft, by: Offset): Draft => ({
    from: current.from,
    to: {
      x: current.to.x - by.x * pane.width * PAN_STEP,
      y: current.to.y - by.y * pane.height * PAN_STEP,
    },
  });

  /** True when the key was the crop's to take. */
  const onKey = (key: string, action: KeyAction | undefined): boolean => {
    if (!enabled) return false;
    if (key === 'Enter') {
      if (draft) finish(draft);
      else setDraft(centredDraft(pane));
      return true;
    }
    if (!draft) return false;
    if (key === 'Escape') {
      setDraft(null);
      return true;
    }
    if (!action || !('pan' in action)) return false;

    setDraft(resize(draft, action.pan));
    return true;
  };

  return {
    draft,
    start: (at: Offset) => setDraft({ from: at, to: at }),
    /** False when no crop is being drawn, so the caller's drag carries on. */
    move: (at: Offset) => {
      if (draft) setDraft({ from: draft.from, to: at });
      return draft !== null;
    },
    end: () => {
      if (draft) finish(draft);
    },
    onKey,
  };
}

/** The box to draw on the pane: the crop being drawn, or else a kept one placed
 *  where the image now is, or none. */
function shownCrop(
  draft: Draft | null,
  crop: Rect | null | undefined,
  offset: Offset,
  scale: number,
): Rect | null {
  if (draft) return between(draft.from, draft.to);

  return crop && scale > 0 ? onPane(crop, offset, scale) : null;
}

interface PaneViewInput {
  view: View | undefined;
  onViewChange: ((view: View) => void) | undefined;
  defaultZoom: number;
  pane: Size;
  natural: Size;
}

/**
 * Where the image sits: the host's view when one is handed down, the pane's own
 * otherwise — and the one way either changes, `apply`.
 *
 * `apply` keeps the change when the pane keeps its own view, and reports it
 * either way, clamped, so a host following it is never handed a view the pane
 * would not show.
 */
function usePaneView({ view, onViewChange, defaultZoom, pane, natural }: PaneViewInput) {
  const [requested, setRequested] = useState(defaultZoom);
  const [rawOffset, setOffset] = useState<Offset>(ORIGIN);

  const cap = zoomCap(natural.width, pane.width);
  const zoom = clamp(view ? view.zoom : requested, 1, cap);
  const image = drawnSize(pane, natural, zoom);
  const offset = clampOffset(view ? offsetOf(view, image) : rawOffset, pane, image);

  const apply = (nextZoom: number, nextOffset: Offset) => {
    const drawn = drawnSize(pane, natural, nextZoom);
    const placed = clampOffset(nextOffset, pane, drawn);
    if (!view) {
      setRequested(nextZoom);
      setOffset(placed);
    }
    onViewChange?.(viewOf(nextZoom, placed, drawn));
  };

  return { cap, zoom, image, offset, apply };
}

interface PaneLayersProps {
  failed: boolean;
  fallback: ReactNode;
  src: string;
  alt: string;
  natural: Size;
  pane: Size;
  image: Size;
  offset: Offset;
  scale: number;
  gridEvery: number | null;
  marks: readonly Mark[] | undefined;
  crop: Rect | null;
  onLoad: (event: SyntheticEvent<HTMLImageElement>) => void;
  onError: () => void;
}

/** What the pane holds, back to front: the image or the sentence in its place,
 *  then the grid, the marks and a crop — each only when there is one. */
function PaneLayers(props: PaneLayersProps) {
  const { failed, image, offset, scale, gridEvery, marks, crop } = props;

  return (
    <>
      {failed ? (
        <p className="ds-panzoom__fallback">{props.fallback}</p>
      ) : (
        <img
          className="ds-panzoom__image"
          src={props.src}
          alt={props.alt}
          draggable={false}
          onLoad={props.onLoad}
          onError={props.onError}
          style={{
            // Pixels once both sizes are known, so a narrow image is never
            // stretched; the pane's width until then.
            width:
              props.natural.width > 0 && props.pane.width > 0
                ? `${image.width}px`
                : '100%',
            transform: `translate(${offset.x}px, ${offset.y}px)`,
          }}
        />
      )}
      {gridEvery !== null && (
        <GridOverlay image={image} offset={offset} gap={gridEvery * scale} />
      )}
      {!failed && scale > 0 && marks && marks.length > 0 && (
        <MarksOverlay marks={marks} image={image} offset={offset} scale={scale} />
      )}
      {!failed && crop && <CropBox rect={crop} />}
    </>
  );
}

export function PanZoom({
  src,
  alt,
  label,
  defaultZoom = 1,
  fallback,
  grid = false,
  marks,
  lead,
  actions,
  view,
  onViewChange,
  cropping = false,
  crop,
  onCrop,
  className,
}: PanZoomProps) {
  const [paneRef, pane] = usePaneSize();
  const [natural, setNatural] = useState<Size>({ width: 0, height: 0 });
  const drag = useRef<{ pointer: Offset; from: Offset } | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === src;

  const { cap, zoom, image, offset, apply } = usePaneView({
    view,
    onViewChange,
    defaultZoom,
    pane,
    natural,
  });
  const center = { x: pane.width / 2, y: pane.height / 2 };

  const zoomTo = (next: number) => apply(next, zoomAbout(offset, zoom, next, center));
  const step = (direction: 1 | -1) => zoomTo(stepZoom(zoom, direction, cap));
  const reset = () => apply(1, ORIGIN);
  const pan = (by: Offset) => apply(zoom, { x: offset.x + by.x, y: offset.y + by.y });

  const controls = controlsFor({ failed, zoom, cap, offset, grid, natural, image });

  const cropDraft = useCropDraft({
    enabled: cropping,
    pane,
    onFinish: (done) => {
      const rect = cropRect(done.from, done.to, offset, controls.scale, natural);
      if (rect) onCrop?.(rect);
    },
  });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const action = KEY_ACTIONS[event.key];
    if (cropDraft.onKey(event.key, action)) {
      // Consumed all the way: an Escape that drops a crop must not also close
      // the dialog the pane sits in.
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!action) return;

    event.preventDefault();
    if ('reset' in action) return reset();
    if ('zoom' in action) return step(action.zoom);
    pan({
      x: action.pan.x * pane.width * PAN_STEP,
      y: action.pan.y * pane.height * PAN_STEP,
    });
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (cropping) return cropDraft.start(panePoint(event));
    drag.current = { pointer: { x: event.clientX, y: event.clientY }, from: offset };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (cropDraft.move(panePoint(event))) return;
    const start = drag.current;
    if (!start) return;

    apply(zoom, {
      x: start.from.x + event.clientX - start.pointer.x,
      y: start.from.y + event.clientY - start.pointer.y,
    });
  };
  const endDrag = () => {
    drag.current = null;
    cropDraft.end();
  };

  const onLoad = (event: SyntheticEvent<HTMLImageElement>) =>
    setNatural({
      width: event.currentTarget.naturalWidth,
      height: event.currentTarget.naturalHeight,
    });

  const shown = shownCrop(cropDraft.draft, crop, offset, controls.scale);

  return (
    <div className={['ds-panzoom', className].filter(Boolean).join(' ')}>
      <div className="ds-panzoom__bar">
        {lead}
        <ZoomControls
          label={label}
          zoom={zoom}
          canZoomOut={controls.canZoomOut}
          canZoomIn={controls.canZoomIn}
          canReset={controls.canReset}
          gridEvery={controls.gridEvery}
          actions={actions}
          onStep={step}
          onReset={reset}
        />
      </div>

      {/* A focusable group rather than an interactive role: the pane is moved
          around in, with keys it documents above, and the buttons are the
          zoom's accessible path for every reader. */}
      <div
        ref={paneRef}
        className={['ds-panzoom__pane', cropping && 'ds-panzoom__pane--cropping']
          .filter(Boolean)
          .join(' ')}
        role="group"
        aria-label={label}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <PaneLayers
          failed={failed}
          fallback={fallback}
          src={src}
          alt={alt}
          natural={natural}
          pane={pane}
          image={image}
          offset={offset}
          scale={controls.scale}
          gridEvery={controls.gridEvery}
          marks={marks}
          crop={shown}
          onLoad={onLoad}
          onError={() => setFailedSrc(src)}
        />
      </div>
    </div>
  );
}
