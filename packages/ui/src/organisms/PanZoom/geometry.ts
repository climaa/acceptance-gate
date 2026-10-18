/**
 * PanZoom's arithmetic, apart from the component that draws it: the floor and
 * the cap, where an image may sit, how a view and a crop are read. Pure, and
 * tested on its own — the arrangement ThemeToggle keeps with theme.ts.
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

export const ORIGIN: Offset = { x: 0, y: 0 };

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/** The highest zoom there is: the image at its natural pixels. An image no
 *  wider than the pane cannot be zoomed at all — 100% already shows it whole —
 *  unless a host asks to `magnify` past the natural pixels by that factor. */
export const zoomCap = (naturalWidth: number, paneWidth: number, magnify = 1) =>
  (paneWidth > 0 && naturalWidth > paneWidth ? naturalWidth / paneWidth : 1) * magnify;

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

/** One axis of {@link clampOffset}: centred where the image fits, since there is
 *  nothing to pan along that axis; otherwise never past the pane's near edge nor
 *  so far the other way that the pane shows past the image's far edge. */
const clampAxis = (at: number, pane: number, image: number) =>
  image < pane ? (pane - image) / 2 : clamp(at, pane - image, 0);

/** An offset the image can actually sit at. An image smaller than the pane on an
 *  axis sits in the middle of it — Board 04 draws a 1248×25 screenshot centred,
 *  not as a sliver in the pane's corner. */
export function clampOffset(offset: Offset, pane: Size, image: Size): Offset {
  return {
    x: clampAxis(offset.x, pane.width, image.width),
    y: clampAxis(offset.y, pane.height, image.height),
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

/** The zoom and offset that open on `region` (in the image's own pixels):
 *  zoomed until it fills the pane on its tighter side, held between the floor
 *  and `cap`, with the region's corner at the pane's. */
export function fitView(
  region: Rect,
  pane: Size,
  natural: Size,
  cap: number,
): { zoom: number; offset: Offset } {
  const scale = drawnSize(pane, natural, 1).width / natural.width;
  const zoom = clamp(
    Math.min(pane.width / (region.width * scale), pane.height / (region.height * scale)),
    1,
    cap,
  );

  return { zoom, offset: { x: -region.x * scale * zoom, y: -region.y * scale * zoom } };
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

/** The box between two pane points, in pane coordinates. */
export const between = (from: Offset, to: Offset): Rect => ({
  x: Math.min(from.x, to.x),
  y: Math.min(from.y, to.y),
  width: Math.abs(to.x - from.x),
  height: Math.abs(to.y - from.y),
});

/** A kept crop, from the image's pixels to where it is drawn on the pane now. */
export const onPane = (rect: Rect, offset: Offset, scale: number): Rect => ({
  x: rect.x * scale + offset.x,
  y: rect.y * scale + offset.y,
  width: rect.width * scale,
  height: rect.height * scale,
});
