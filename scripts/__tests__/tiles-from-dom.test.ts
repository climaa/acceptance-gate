import { describe, expect, it } from 'vitest';

// @ts-expect-error — plain .mjs with JSDoc types, no declaration file.
import * as svg from '../pen/tiles-from-dom/svg.mjs';

const { createTables, lightPreview, pairThemes, readSentinel, renderTile, sentinel } =
  svg;

/**
 * A tile drawn from a rendered story reaches Pen as an SVG whose colours are
 * sentinels: Pen's SVG import knows nothing of design tokens, so the colour
 * carries a palette slot the place snippet names by the token whose light and
 * dark values both match. These pin the pairing and the encoding that make the
 * dark tile, a ref of the light one, come out right.
 */
type Rgba = [number, number, number, number];
const INK: Rgba = [15, 27, 24, 1];
const PAPER: Rgba = [238, 243, 241, 1];
const NIGHT: Rgba = [13, 21, 19, 1];
const rect = (c: Rgba, x = 0) => ({ t: 'r', x, y: 0, w: 10, h: 10, rad: 0, c });
const label = (c: Rgba, s = 'Models') => ({
  t: 't',
  x: 4,
  y: 12,
  s,
  ff: 'Inter',
  fs: 13,
  fw: '400',
  ls: 0.6,
  c,
});

describe('pairThemes', () => {
  it('pairs each light operation with the dark one drawn in the same place', () => {
    // Arrange
    const light = [rect(PAPER), label(INK)];
    const dark = [rect(NIGHT), label(PAPER)];

    // Act
    const pairs = pairThemes(light, dark);

    // Assert
    expect(pairs.map((p: { flag: number; dark: Rgba }) => [p.flag, p.dark])).toEqual([
      [0, NIGHT],
      [0, PAPER],
    ]);
  });

  it('keeps an operation one theme draws and the other does not, flagged for its theme', () => {
    // Arrange — the theme toggle draws a moon in light and a sun in dark
    const moon = { t: 'ps', d: 'M1 1L2 2', sw: 1.5, c: INK };
    const sun = { t: 'es', x: 5, y: 5, rx: 3, ry: 3, sw: 1.5, c: PAPER };

    // Act
    const pairs = pairThemes([rect(PAPER), moon], [rect(NIGHT), sun]);

    // Assert
    expect(
      pairs.map((p: { flag: number; op: { t: string } }) => [p.op.t, p.flag]),
    ).toEqual([
      ['r', 0],
      ['ps', 1],
      ['es', 2],
    ]);
  });
});

describe('sentinels', () => {
  it('reads back the flag, style, slot and alpha it wrote, in the short form Pen may use', () => {
    // Arrange
    const written = sentinel(0, 0, 0x10);

    // Act
    const long = readSentinel(`${written}80`);
    const short = readSentinel('#001');

    // Assert
    expect(written).toBe('#000011');
    expect(long).toEqual({ flag: 0, style: 0, slot: 0x10, alpha: 128 / 255 });
    expect(short).toEqual({ flag: 0, style: 0, slot: 0x10, alpha: 1 });
  });
});

describe('renderTile', () => {
  it('writes the marker first and one palette slot per light and dark pair', () => {
    // Arrange
    const tables = createTables();
    const pairs = pairThemes(
      [rect(PAPER), rect(PAPER, 20), label(INK)],
      [rect(NIGHT), rect(NIGHT, 20), label(PAPER)],
    );

    // Act
    const { svg: out } = renderTile({
      key: 'templates__desktop__light__templates-page--default',
      size: [1280.4, 800],
      pairs,
      tables,
    });

    // Assert
    expect(out).toMatch(
      /^<svg [^>]*width="1280" height="800"[^>]*><text[^>]*>TILE:templates__desktop__light__templates-page--default<\/text>/,
    );
    expect(tables.palette).toEqual([
      ['#EEF3F1', '#0D1513'],
      ['#0F1B18', '#EEF3F1'],
    ]);
    expect(tables.styles).toEqual([0, 0.6]);
    expect(out).toContain('letter-spacing="0.6" fill="#000102"');
  });

  it('reports an image instead of drawing it', () => {
    // Arrange
    const tables = createTables();
    const img = {
      t: 'img',
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      src: 'https://example.test/a.png',
      c: [0, 0, 0, 0],
    };

    // Act
    const { svg: out, undrawn } = renderTile({
      key: 'k',
      size: [10, 10],
      pairs: pairThemes([img], [img]),
      tables,
    });

    // Assert
    expect(undrawn).toEqual(['image https://example.test/a.png']);
    expect(out).not.toContain('<image');
  });
});

describe('lightPreview', () => {
  it('puts the light colours back and drops what only dark draws', () => {
    // Arrange
    const tables = createTables();
    const sun = { t: 'es', x: 5, y: 5, rx: 3, ry: 3, sw: 1.5, c: PAPER };
    const { svg: out } = renderTile({
      key: 'k',
      size: [10, 10],
      pairs: pairThemes([label(INK)], [label(PAPER), sun]),
      tables,
    });

    // Act
    const preview = lightPreview(out, tables.palette);

    // Assert
    expect(preview).not.toContain('TILE:');
    expect(preview).toContain('fill="#0F1B18"');
    expect(preview).not.toContain('<ellipse');
  });
});
