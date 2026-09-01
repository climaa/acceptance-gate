// Imported explicitly rather than relying on `globals: true` — same reason as
// content.test.ts: tsconfig's `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import { ARTBOARD, ARTWORK, ZOOM, zoomStaysInside } from '../lib/changelog-sync-asset';

/**
 * The crop that takes the margin out of the icon, and the one thing it must
 * never do: cut the artwork off.
 *
 * This exists because that is exactly what shipped. The zoom was derived from
 * the bounds of frame 0 — the resting composition, 304 x 320, which tolerates
 * 1.60 — and 1.5 looked correct in every still screenshot taken of it. Then the
 * animation played: the pencil travels during the syncing segment, the drawing
 * reaches 321 x 354 around frames 58 to 62, and the top-right corner went off
 * the edge. A measurement of one frame answered a question about 180 of them.
 *
 * So the assertions below are about the MOVING extent. Nothing here re-derives
 * it — that is a measurement against rendered pixels, recorded in
 * `changelog-sync-asset.ts` — but it does hold the zoom to it, which is the part
 * that was checked by eye and got it wrong.
 */

describe('the icon crop', () => {
  it('keeps the whole animation inside the artboard', () => {
    expect(zoomStaysInside(ZOOM)).toBe(true);
  });

  /**
   * The guard has to be capable of saying no, or the case above passes for any
   * value and this file is decoration. 1.5 is not an arbitrary counter-example:
   * it is the value that shipped and clipped.
   */
  it('refuses the zoom that clipped', () => {
    expect(zoomStaysInside(1.5)).toBe(false);
  });

  it('leaves room rather than sitting on the limit', () => {
    // A crop tuned to the exact edge has nothing left for a re-export that
    // moves the composition by a pixel, and reads as pressed against the box.
    expect(zoomStaysInside(ZOOM + 0.1)).toBe(true);
  });

  /**
   * The distinction the original derivation missed, asserted so it cannot be
   * quietly collapsed back into one number.
   */
  it('records a moving extent larger than the resting one', () => {
    expect(ARTWORK.motionWidth).toBeGreaterThan(ARTWORK.restWidth);
    expect(ARTWORK.motionHeight).toBeGreaterThan(ARTWORK.restHeight);
  });

  it('crops something, or the whole mechanism is doing nothing', () => {
    // The artwork covers about 62% of the artboard at rest; the crop exists to
    // take that margin back.
    expect(ARTWORK.restHeight / ARTBOARD).toBeLessThan(0.7);
    expect(ZOOM).toBeGreaterThan(1);
  });
});
