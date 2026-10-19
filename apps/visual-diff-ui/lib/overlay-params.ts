import { PAN_ZOOM_STEP } from '@gate/ui';
import type { Nudge } from './board-crop';

/**
 * The shot view's overlay, as the address carries it — so a link opens on the
 * alignment someone made, not on a fresh one they have to make again.
 *
 * `view=overlay` lays the crop on the screenshot; the rest only means anything
 * there, so it is written only then. Each value is left out at its default, the
 * rule `shotViewHref` keeps for the board, so an untouched overlay is one word:
 *
 *   view=overlay&blend=difference&opacity=60&offset=-14,-11&shot=2,0&zoom=759
 *
 * `offset` is the board's nudge and `shot` the screenshot's, in the screenshot's
 * CSS pixels; `zoom` is the readout, in percent. Which layer the arrows move is
 * left out: it changes what a key does, not what is on screen.
 */

/** Zoom steps, as PanZoom steps them, from the shot's own size: six steps of
 *  PanZoom's own step, so the two views zoom alike. */
export const ZOOMS = Array.from({ length: 6 }, (_, at) => PAN_ZOOM_STEP ** at);

/** The overlay step nearest a zoom, so switching from side by side keeps the zoom
 *  the reader was at instead of dropping back to 100%. Both step by
 *  {@link PAN_ZOOM_STEP}, so a synced pane's zoom lands on one exactly. */
export function zoomIndexOf(zoom: number | undefined): number {
  if (!zoom || zoom <= 1) return 0;
  const at = Math.round(Math.log(zoom) / Math.log(PAN_ZOOM_STEP));

  return Math.min(Math.max(at, 0), ZOOMS.length - 1);
}

/** A zoom step as its readout says it: 1.5 is 150. */
export const zoomPercent = (at: number) => Math.round((ZOOMS[at] ?? 1) * 100);

/** How the crop is laid on the screenshot. */
export type Blend = 'normal' | 'difference';

export interface OverlayAlignment {
  blend: Blend;
  /** The board's opacity, 0–100. */
  opacity: number;
  board: Nudge;
  shot: Nudge;
  /** The zoom step, or undefined to start where the panes were. */
  zoomAt: number | undefined;
}

export const ORIGIN: Nudge = { x: 0, y: 0 };

export const OVERLAY_DEFAULTS: OverlayAlignment = {
  blend: 'normal',
  opacity: 50,
  board: ORIGIN,
  shot: ORIGIN,
  zoomAt: undefined,
};

/** What the address is read through: `useSearchParams()` or URLSearchParams. */
export interface AddressParams {
  get: (name: string) => string | null;
}

const INTEGER = /^-?\d+$/;

/** `x,y` in whole pixels, or the origin for anything else. */
function parseNudge(value: string | null): Nudge {
  const [x, y, extra] = (value ?? '').split(',');
  if (extra !== undefined || !x || !y || !INTEGER.test(x) || !INTEGER.test(y)) {
    return ORIGIN;
  }

  return { x: Number(x), y: Number(y) };
}

function parseOpacity(value: string | null): number {
  if (!value || !INTEGER.test(value)) return OVERLAY_DEFAULTS.opacity;

  return Math.min(Math.max(Number(value), 0), 100);
}

/** The readout's percent back to its step; a value no step is lands on the
 *  nearest, and anything else leaves the zoom to the panes. */
function parseZoom(value: string | null): number | undefined {
  if (!value || !INTEGER.test(value)) return undefined;

  return zoomIndexOf(Number(value) / 100);
}

/** Whether the address asks for the overlay. */
export const asksOverlay = (params: AddressParams) => params.get('view') === 'overlay';

/** The overlay the address carries; a value it cannot read is its default. */
export function parseOverlay(params: AddressParams): OverlayAlignment {
  return {
    blend: params.get('blend') === 'difference' ? 'difference' : 'normal',
    opacity: parseOpacity(params.get('opacity')),
    board: parseNudge(params.get('offset')),
    shot: parseNudge(params.get('shot')),
    zoomAt: parseZoom(params.get('zoom')),
  };
}

const moved = (at: Nudge) => at.x !== 0 || at.y !== 0;

/**
 * The overlay as a query, written by hand for the reason a crop is: a nudge is
 * digits and commas, which URLSearchParams would spell %2C. Empty when the view
 * is side by side, so a link to the panes stays as bare as it was.
 */
export function overlayQuery(overlay: boolean, at: OverlayAlignment): string {
  if (!overlay) return '';

  return [
    'view=overlay',
    at.blend === 'normal' ? '' : `blend=${at.blend}`,
    at.opacity === OVERLAY_DEFAULTS.opacity ? '' : `opacity=${at.opacity}`,
    moved(at.board) ? `offset=${at.board.x},${at.board.y}` : '',
    moved(at.shot) ? `shot=${at.shot.x},${at.shot.y}` : '',
    at.zoomAt ? `zoom=${zoomPercent(at.zoomAt)}` : '',
  ]
    .filter(Boolean)
    .join('&');
}
