import { describe, expect, it } from 'vitest';

import {
  clampOffset,
  cropRect,
  drawnSize,
  fitWidth,
  gridStep,
  offsetOf,
  stepZoom,
  viewOf,
  zoomAbout,
  zoomCap,
} from './geometry';

describe('zoomCap', () => {
  it('rises past the natural pixels by the factor a host asks to magnify', () => {
    expect(zoomCap(1600, 400, 2)).toBe(8);
  });

  it('lets an image narrower than the pane be magnified too', () => {
    expect(zoomCap(300, 400, 8)).toBe(8);
  });

  it('is the image at its natural pixels', () => {
    const cap = zoomCap(1600, 400);

    expect(cap).toBe(4);
  });

  it('is 100% for an image no wider than the pane — it is already whole', () => {
    const cap = zoomCap(300, 400);

    expect(cap).toBe(1);
  });

  it('is 100% before the pane has been measured', () => {
    const cap = zoomCap(1600, 0);

    expect(cap).toBe(1);
  });
});

describe('stepZoom', () => {
  it('steps in by 1.5', () => {
    const next = stepZoom(1, 1, 4);

    expect(next).toBe(1.5);
  });

  it('stops at the cap', () => {
    const next = stepZoom(3, 1, 4);

    expect(next).toBe(4);
  });

  it('never steps out below 100%', () => {
    const next = stepZoom(1.2, -1, 4);

    expect(next).toBe(1);
  });

  // 1.5 × 1.5 / 1.5 / 1.5 is 1 only up to floating point: the floor has to be
  // reachable by stepping, or `−` never disables.
  it('lands exactly on the floor after stepping in and back out', () => {
    const next = stepZoom(stepZoom(stepZoom(stepZoom(1, 1, 4), 1, 4), -1, 4), -1, 4);

    expect(next).toBe(1);
  });
});

describe('clampOffset', () => {
  const pane = { width: 400, height: 300 };
  const image = { width: 800, height: 1200 };

  it('never lets the image move right of or below the pane origin', () => {
    const offset = clampOffset({ x: 50, y: 20 }, pane, image);

    expect(offset).toEqual({ x: 0, y: 0 });
  });

  it('stops where the image far edge meets the pane far edge', () => {
    const offset = clampOffset({ x: -5000, y: -5000 }, pane, image);

    expect(offset).toEqual({ x: -400, y: -900 });
  });

  it('pins an image shorter than the pane to its top', () => {
    const offset = clampOffset({ x: 0, y: -40 }, pane, { width: 400, height: 100 });

    expect(offset).toEqual({ x: 0, y: 0 });
  });
});

describe('zoomAbout', () => {
  it('keeps the point under the anchor where it was', () => {
    const anchor = { x: 200, y: 150 };

    const offset = zoomAbout({ x: 0, y: 0 }, 1, 2, anchor);

    // The image point under the anchor was (200,150); at 2× it is (400,300),
    // and an offset of (−200,−150) puts it back under the anchor.
    expect(offset).toEqual({ x: -200, y: -150 });
  });
});

describe('gridStep', () => {
  // A 2,642-pixel board fitted to a 681-pixel pane: about 0.26 drawn per pixel.
  it('is coarse over a whole board at 100%', () => {
    const step = gridStep(681 / 2642);

    expect(step).toBe(64);
  });

  it('gets finer as the zoom gets closer', () => {
    const step = gridStep(2);

    expect(step).toBe(8);
  });

  it('never goes finer than 4 image pixels, however close the zoom', () => {
    const step = gridStep(50);

    expect(step).toBe(4);
  });

  it('stops at its coarsest step for an image shrunk past any useful grid', () => {
    const step = gridStep(0.001);

    expect(step).toBe(1024);
  });
});

describe('fitWidth', () => {
  it('is the pane width for an image wider than the pane', () => {
    const width = fitWidth(1600, 400);

    expect(width).toBe(400);
  });

  // A screenshot drawn wider than it was captured is a blurred claim about it.
  it('is the image own width for an image narrower than the pane', () => {
    const width = fitWidth(300, 400);

    expect(width).toBe(300);
  });

  it('is the pane width before the image has reported a size', () => {
    const width = fitWidth(0, 400);

    expect(width).toBe(400);
  });
});

describe('drawnSize', () => {
  it('never stretches a narrow image at 100%', () => {
    const size = drawnSize({ width: 400, height: 300 }, { width: 200, height: 100 }, 1);

    expect(size).toEqual({ width: 200, height: 100 });
  });

  it('is the pane width times the zoom, in the image proportions', () => {
    const size = drawnSize({ width: 400, height: 300 }, { width: 1600, height: 2400 }, 2);

    expect(size).toEqual({ width: 800, height: 1200 });
  });
});

describe('viewOf and offsetOf', () => {
  const IMAGE = { width: 800, height: 1200 };

  it('reads an offset as the share of the image at the pane top-left', () => {
    expect(viewOf(2, { x: -200, y: -600 }, IMAGE)).toEqual({ zoom: 2, x: 0.25, y: 0.5 });
  });

  it('puts the image back where the view says', () => {
    expect(offsetOf({ zoom: 2, x: 0.25, y: 0.5 }, IMAGE)).toEqual({ x: -200, y: -600 });
  });

  it('reads the top-left of an image not yet measured', () => {
    expect(viewOf(1, { x: 0, y: 0 }, { width: 0, height: 0 })).toEqual({
      zoom: 1,
      x: 0,
      y: 0,
    });
  });
});

describe('cropRect', () => {
  const NATURAL_SIZE = { width: 1600, height: 2400 };

  // 0.25 drawn pixels per image pixel, the image 40 px up the pane.
  it('turns two pane points into a box in the image own pixels', () => {
    const rect = cropRect(
      { x: 100, y: 10 },
      { x: 200, y: 60 },
      { x: 0, y: -40 },
      0.25,
      NATURAL_SIZE,
    );

    expect(rect).toEqual({ x: 400, y: 200, width: 400, height: 200 });
  });

  it('reads a box drawn up and to the left the same as one drawn down and right', () => {
    const rect = cropRect(
      { x: 200, y: 60 },
      { x: 100, y: 10 },
      { x: 0, y: 0 },
      0.25,
      NATURAL_SIZE,
    );

    expect(rect).toEqual({ x: 400, y: 40, width: 400, height: 200 });
  });

  it('holds a box inside the image', () => {
    const rect = cropRect(
      { x: -50, y: -50 },
      { x: 40, y: 40 },
      { x: 0, y: 0 },
      0.25,
      NATURAL_SIZE,
    );

    expect(rect).toEqual({ x: 0, y: 0, width: 160, height: 160 });
  });

  it('is no crop for a click, which has no area', () => {
    expect(
      cropRect({ x: 10, y: 10 }, { x: 10, y: 10 }, { x: 0, y: 0 }, 0.25, NATURAL_SIZE),
    ).toBeNull();
  });

  it('is no crop before the image has a scale', () => {
    expect(
      cropRect({ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 0 }, 0, NATURAL_SIZE),
    ).toBeNull();
  });
});
