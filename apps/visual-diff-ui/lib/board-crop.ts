import type { PanZoomRect } from '@gate/ui';

/**
 * A crop of a design board, as the shot view keeps it: in the board PNG's own
 * pixels, in the address so a link reproduces it, and read back in CSS pixels
 * so it can be laid over a screenshot at the screenshot's scale.
 *
 * Pure and client-safe. The board's export scale — PNG pixels per design pixel —
 * comes from its sidecar (app/api/designs/route.ts); a design pixel is a CSS
 * pixel, and a screenshot is captured at one device pixel per CSS pixel, so
 * dividing by the scale is the whole conversion.
 */

const CROP_PARAM = /^(\d+),(\d+),(\d+),(\d+)$/;

/** `?crop=x,y,w,h` read back, or null for anything that is not one — a crop with
 *  no area included, since there is nothing to pin. */
export function parseCrop(value: string | null): PanZoomRect | null {
  const match = value === null ? null : CROP_PARAM.exec(value);
  if (!match) return null;

  const [x, y, width, height] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
  ];

  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

/** A crop as the address carries it. */
export const cropParam = (rect: PanZoomRect) =>
  `${rect.x},${rect.y},${rect.width},${rect.height}`;

/** A crop's size in CSS pixels, at the scale its board was exported at. */
export const cssSize = (rect: PanZoomRect, scale: number) => ({
  width: rect.width / scale,
  height: rect.height / scale,
});

/** How far one arrow press moves a laid-over crop, in CSS pixels: one, or ten
 *  with Shift. */
const NUDGES: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export interface Nudge {
  x: number;
  y: number;
}

/** The offset an arrow key moves a crop to, or null for a key that is not one. */
export function nudged(at: Nudge, key: string, shift: boolean): Nudge | null {
  const step = NUDGES[key];
  if (!step) return null;

  const by = shift ? 10 : 1;

  return { x: at.x + step[0] * by, y: at.y + step[1] * by };
}

/** An offset as the overlay states it: signed, so +3, −1 reads as a direction. */
export const nudgeText = (at: Nudge) =>
  [at.x, at.y].map((n) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`)).join(', ');
