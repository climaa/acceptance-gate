import { Buffer } from 'node:buffer';

import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import { THRESHOLDS, variantKey } from '../policy.mjs';
import {
  MARGIN_COLOR,
  STRICT_ENV,
  allowedDiffPixels,
  compareAll,
  comparePixels,
  isStrict,
} from '../compare.mjs';

const WHITE = [255, 255, 255];
const INK = [17, 17, 17];

/** A generated fixture: `paint(x, y)` gives the RGB at each pixel, opaque throughout.
 *  Fixtures are built here rather than committed as binaries — a PNG in the repo is a
 *  fixture nobody can review in a diff.
 *  @param {number} width @param {number} height
 *  @param {(x: number, y: number) => readonly number[]} paint
 *  @returns {Buffer} */
function png(width, height, paint) {
  const image = new PNG({ width, height });

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue] = paint(x, y);
      const offset = (y * width + x) * 4;
      image.data.set([red, green, blue, 255], offset);
    }
  }

  return PNG.sync.write(image);
}

/** A card: an ink block inset by `padding` on a white field. The one fixture the
 *  overlap half of the suite is built on — changing its padding is the milestone. */
const card = (width, height, padding) =>
  png(width, height, (x, y) =>
    x >= padding && x < width - padding && y >= padding && y < height - padding
      ? INK
      : WHITE,
  );

/** The same card with `extra` blank rows under it: the story that simply got taller,
 *  whose every differing pixel is one the baseline does not have. */
const tallerCard = (extra) =>
  png(200, 100 + extra, (x, y) =>
    y >= 10 && y < 90 && x >= 10 && x < 190 ? INK : WHITE,
  );

/** The card with a speck of ink outside its block: fewer differing pixels than the
 *  floor allows, so only strict mode reports it. */
const cardWithSpeck = () =>
  png(200, 100, (x, y) => {
    if (y === 95 && x < 20) return INK;
    return x >= 10 && x < 190 && y >= 10 && y < 90 ? INK : WHITE;
  });

/** The RGBA at one pixel of a diff PNG. @param {Uint8Array} bytes */
function pixelAt(bytes, x, y) {
  const image = PNG.sync.read(Buffer.from(bytes));
  const offset = (y * image.width + x) * 4;

  return [...image.data.subarray(offset, offset + 3)];
}

describe('comparePixels', () => {
  it('passes an identical pair with nothing in either half of the split', () => {
    const shot = card(200, 100, 10);

    const result = comparePixels(shot, shot);

    expect(result).toMatchObject({
      pass: true,
      overlapDiffPixels: 0,
      marginPixels: 0,
      diffPixels: 0,
    });
  });

  it('writes no diff PNG for a pair that passes', () => {
    const shot = card(200, 100, 10);

    const result = comparePixels(shot, shot);

    expect(result.diff).toBeNull();
  });

  it('reports a padding change as overlap, never as margin', () => {
    const before = card(200, 100, 10);
    const after = card(200, 100, 14);

    const result = comparePixels(before, after);

    expect(result).toMatchObject({ pass: false, marginPixels: 0 });
    expect(result.overlapDiffPixels).toBeGreaterThan(THRESHOLDS.maxDiffPixels);
  });

  it('reports a story that only got taller as margin, never as overlap', () => {
    const before = card(200, 100, 10);
    const after = tallerCard(40);

    const result = comparePixels(before, after);

    expect(result).toMatchObject({
      pass: false,
      overlapDiffPixels: 0,
      marginPixels: 200 * 40,
    });
  });

  it('paints the margin band solid magenta, so a taller story reads as taller', () => {
    const before = card(200, 100, 10);
    const after = tallerCard(40);

    const { diff } = comparePixels(before, after);

    expect(pixelAt(diff, 100, 120)).toEqual([...MARGIN_COLOR]);
  });

  it('sizes the diff PNG to the union box, so no changed pixel falls off it', () => {
    const before = card(200, 100, 10);
    const after = card(160, 140, 10);

    const { diff } = comparePixels(before, after);
    const image = PNG.sync.read(Buffer.from(diff));

    expect([image.width, image.height]).toEqual([200, 140]);
  });

  it('records the size change as both shapes, not as a verdict about them', () => {
    const before = card(200, 100, 10);
    const after = tallerCard(40);

    const result = comparePixels(before, after);

    expect(result.sizeDelta).toBe('200×100 → 200×140');
  });

  it('leaves sizeDelta null when the two shots are the same shape', () => {
    const result = comparePixels(card(200, 100, 10), card(200, 100, 14));

    expect(result.sizeDelta).toBeNull();
  });
});

describe('the two threshold levels', () => {
  /** A row of stray pixels: the shape of a rehinted glyph edge, at a count the test
   *  picks so the floor and the ratio can be told apart. */
  const strayPixels = (width, height, count) =>
    png(width, height, (x, y) => (y === 10 && x < count ? INK : WHITE));

  it('lets a hairline through on a small shot, where the ratio alone would be brutal', () => {
    const before = png(100, 50, () => WHITE);
    const after = strayPixels(100, 50, 20);

    const result = comparePixels(before, after);

    expect(result).toMatchObject({ pass: true, overlapDiffPixels: 20 });
  });

  it('lets the ratio, not the floor, judge a shot big enough to earn one', () => {
    const before = png(400, 250, () => WHITE);
    const after = strayPixels(400, 250, 45);

    const result = comparePixels(before, after);

    expect(result.allowedDiffPixels).toBeGreaterThan(THRESHOLDS.maxDiffPixels);
    expect(result).toMatchObject({ pass: true, overlapDiffPixels: 45 });
  });

  it('counts no antialiased edge as a change — the setting text-heavy shots need', () => {
    const before = png(100, 50, (x, y) => (y >= 20 ? INK : WHITE));
    const after = png(100, 50, (x, y) => {
      if (y >= 21) return INK;
      return y === 20 ? [136, 136, 136] : WHITE;
    });

    const result = comparePixels(before, after, { strict: true });

    expect(result).toMatchObject({ pass: true, overlapDiffPixels: 0 });
  });

  it('fails the same hairline under strict, which is where flake is hunted', () => {
    const before = png(100, 50, () => WHITE);
    const after = strayPixels(100, 50, 20);

    const result = comparePixels(before, after, { strict: true });

    expect(result).toMatchObject({ pass: false, allowedDiffPixels: 0 });
  });
});

describe('allowedDiffPixels', () => {
  it('holds a small shot to the floor rather than to its own area', () => {
    const allowed = allowedDiffPixels(200, 100, false);

    expect(allowed).toBe(THRESHOLDS.maxDiffPixels);
  });

  it('holds a full-viewport shot to its ratio', () => {
    const allowed = allowedDiffPixels(1280, 800, false);

    expect(allowed).toBe(THRESHOLDS.maxDiffRatio * 1280 * 800);
  });

  it('zeroes both terms under strict, whatever the shot measures', () => {
    const allowed = allowedDiffPixels(1280, 800, true);

    expect(allowed).toBe(0);
  });
});

describe('isStrict', () => {
  it('is on for exactly "1"', () => {
    const strict = isStrict({ [STRICT_ENV]: '1' });

    expect(strict).toBe(true);
  });

  it('is off when the variable is unset', () => {
    const strict = isStrict({});

    expect(strict).toBe(false);
  });

  it('is off for "false", which truthiness would have turned on', () => {
    const strict = isStrict({ [STRICT_ENV]: 'false' });

    expect(strict).toBe(false);
  });

  it('is off for "0"', () => {
    const strict = isStrict({ [STRICT_ENV]: '0' });

    expect(strict).toBe(false);
  });
});

/** A capture result as `capture.mjs` writes one, narrowed to what the comparer reads. */
function captured(overrides = {}) {
  const variant = { tier: 'atoms', viewport: 'desktop', theme: 'light', id: 'a-button' };
  const bytes = card(200, 100, 10);

  return {
    ...variant,
    key: variantKey(variant),
    fullPage: false,
    bucket: 'captured',
    bytes,
    width: 200,
    height: 100,
    violations: [],
    error: null,
    ...overrides,
  };
}

/** @param {readonly {key: string, bytes: Uint8Array | null}[]} captures */
const baselinesOf = (captures) =>
  new Map(captures.map((capture) => [capture.key, capture.bytes]));

describe('compareAll buckets', () => {
  it('calls a variant that matches its baseline unchanged, and passes it', () => {
    const captures = [captured()];

    const [result] = compareAll({ captures, baselines: baselinesOf(captures) });

    expect(result).toMatchObject({ bucket: 'unchanged', pass: true, diff: null });
  });

  it('calls a variant that outgrew its allowance changed', () => {
    const baselines = baselinesOf([captured()]);

    const [result] = compareAll({
      captures: [captured({ bytes: card(200, 100, 14) })],
      baselines,
    });

    expect(result).toMatchObject({ bucket: 'changed', pass: false });
  });

  it('hands a changed variant the diff PNG a reviewer opens', () => {
    const baselines = baselinesOf([captured()]);

    const [result] = compareAll({
      captures: [captured({ bytes: card(200, 100, 14) })],
      baselines,
    });

    expect(result.diff).toBeInstanceOf(Uint8Array);
  });

  it('calls a variant with no baseline added — a new story is accepted deliberately', () => {
    const captures = [captured()];

    const [result] = compareAll({ captures, baselines: new Map() });

    expect(result).toMatchObject({
      bucket: 'added',
      pass: false,
      overlapDiffPixels: 0,
      marginPixels: 0,
      diff: null,
    });
  });

  it('sizes an added variant from its own shot, so the report can show it', () => {
    const [result] = compareAll({ captures: [captured()], baselines: new Map() });

    expect(result).toMatchObject({ width: 200, height: 100 });
  });

  it('calls a baseline with no candidate removed', () => {
    const orphan = captured();

    const [result] = compareAll({ captures: [], baselines: baselinesOf([orphan]) });

    expect(result).toMatchObject({ key: orphan.key, bucket: 'removed', pass: false });
  });

  it('names the removed variant off its own key, so the report can place it', () => {
    const orphan = captured();

    const [result] = compareAll({ captures: [], baselines: baselinesOf([orphan]) });

    expect(result).toMatchObject({
      id: 'a-button',
      tier: 'atoms',
      viewport: 'desktop',
      theme: 'light',
    });
  });

  it('reports a baseline naming no matrix cell rather than reading it back as one', () => {
    const baselines = new Map([
      ['retired__desktop__light__a-button', card(200, 100, 10)],
    ]);

    const [result] = compareAll({ captures: [], baselines });

    expect(result).toMatchObject({ bucket: 'removed', tier: null });
    expect(result.error).toContain('retired__desktop__light__a-button');
  });

  it('keeps a capture that failed in its own bucket, with the reason it failed', () => {
    const captures = [
      captured({ bucket: 'errored', error: 'story never finished rendering' }),
    ];

    const [result] = compareAll({ captures, baselines: baselinesOf(captures) });

    expect(result).toMatchObject({
      bucket: 'errored',
      pass: false,
      error: 'story never finished rendering',
    });
  });

  it('errors a capture that came back without pixels, rather than comparing nothing', () => {
    const captures = [captured({ bytes: null })];

    const [result] = compareAll({ captures, baselines: new Map() });

    expect(result.bucket).toBe('errored');
  });

  it('fails an a11y variant whose pixels are identical — that is why the bucket exists', () => {
    const violations = [{ id: 'color-contrast', nodes: 2 }];
    const captures = [captured({ bucket: 'a11y', violations })];

    const [result] = compareAll({ captures, baselines: baselinesOf(captures) });

    expect(result).toMatchObject({ bucket: 'a11y', pass: false, violations });
  });

  it('still reports the pixel split for an a11y variant that also changed', () => {
    const baselines = baselinesOf([captured()]);
    const captures = [captured({ bucket: 'a11y', bytes: card(200, 100, 14) })];

    const [result] = compareAll({ captures, baselines });

    expect(result.bucket).toBe('a11y');
    expect(result.overlapDiffPixels).toBeGreaterThan(0);
  });

  it('leaves a sub-floor change unchanged by default', () => {
    const captures = [captured({ bytes: cardWithSpeck() })];

    const [result] = compareAll({ captures, baselines: baselinesOf([captured()]) });

    expect(result.bucket).toBe('unchanged');
  });

  it('reads strict mode off the environment it was handed', () => {
    const captures = [captured({ bytes: cardWithSpeck() })];
    const baselines = baselinesOf([captured()]);

    const [result] = compareAll({ captures, baselines, env: { [STRICT_ENV]: '1' } });

    expect(result.bucket).toBe('changed');
  });
});

describe('compareAll ordering', () => {
  /** Two variants of one story differ only by id here, which is all the sort reads. */
  const idOf = (id) => ({ tier: 'atoms', viewport: 'desktop', theme: 'light', id });
  const withId = (id, bytes) =>
    captured({ ...idOf(id), key: variantKey(idOf(id)), bytes });

  it('sorts a real repaint above a story that merely got taller', () => {
    const repainted = withId('a-repaint', card(200, 100, 14));
    const resized = withId('b-resize', tallerCard(800));
    const baselines = new Map([
      [repainted.key, card(200, 100, 10)],
      [resized.key, card(200, 100, 10)],
    ]);

    const order = compareAll({ captures: [resized, repainted], baselines });

    expect(order.map((result) => result.id)).toEqual(['a-repaint', 'b-resize']);
  });

  it('gives the resize the larger total, which is exactly why it is not the sort key', () => {
    const captures = [captured({ bytes: tallerCard(800) })];

    const [result] = compareAll({ captures, baselines: baselinesOf([captured()]) });

    expect(result).toMatchObject({ overlapDiffPixels: 0, marginPixels: 200 * 800 });
    expect(result.diffPixels).toBeGreaterThan(result.overlapDiffPixels);
  });

  it('breaks a tie by key, so two runs over the same corpus report the same order', () => {
    const first = withId('z-last', card(200, 100, 10));
    const second = withId('a-first', card(200, 100, 10));

    const order = compareAll({ captures: [first, second], baselines: new Map() });

    expect(order.map((result) => result.id)).toEqual(['a-first', 'z-last']);
  });
});
