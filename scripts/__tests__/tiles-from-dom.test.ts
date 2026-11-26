import { afterEach, describe, expect, it, vi } from 'vitest';

// @ts-expect-error — plain .mjs with JSDoc types, no declaration file.
import * as svg from '../pen/tiles-from-dom/svg.mjs';
// @ts-expect-error — plain .mjs that runs in the browser, no declaration file.
import { extractPage } from '../pen/tiles-from-dom/extract-page.mjs';

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

/**
 * `extractPage` runs in the browser, so these stand a few SVG elements up as plain
 * objects carrying just what it reads: computed style, screen matrix, geometry.
 * The root is the <svg> itself; its box sits at (10, 20) and every shape's matrix
 * scales by 2 and moves by (30, 40), so a point (x, y) lands at (2x + 20, 2y + 20).
 */
type Style = Record<string, string>;
type Shape = Record<string, unknown> & { tagName: string; style: Style };
class FakeSvgElement {
  [key: string]: unknown;
}
const BASE: Style = {
  display: 'inline',
  visibility: 'visible',
  opacity: '1',
  fill: 'none',
  fillOpacity: '1',
  stroke: 'none',
  strokeOpacity: '1',
  strokeWidth: '0',
  vectorEffect: 'none',
  strokeLinecap: 'round',
  strokeLinejoin: 'miter',
  fontFamily: '"Inter", sans-serif',
  fontSize: '10px',
  fontWeight: '600',
  fontStyle: 'normal',
  textAnchor: 'middle',
};
const FILL = 'rgb(10, 20, 30)';
const STROKE = 'rgb(1, 2, 3)';
const SCALE_2 = { a: 2, b: 0, c: 0, d: 2, e: 30, f: 40 };
const val = (value: number) => ({ baseVal: { value } });
const shape = (tagName: string, style: Style, props: Record<string, unknown> = {}) =>
  Object.assign(new FakeSvgElement(), {
    tagName,
    style: { ...BASE, ...style },
    closest: () => null,
    getScreenCTM: () => SCALE_2,
    ...props,
  }) as Shape;
const along = (len: number, at: (l: number) => { x: number; y: number }) => ({
  getTotalLength: () => len,
  getPointAtLength: at,
});
const d = (xs: number[], y: number, moves: number[] = []) =>
  xs
    .map(
      (x, i) =>
        (i === 0 || moves.includes(i) ? 'M' : 'L') + `${x.toFixed(2)} ${y.toFixed(2)}`,
    )
    .join('');

function extractShapes(shapes: Shape[]) {
  const svgRoot = Object.assign(new FakeSvgElement(), {
    tagName: 'svg',
    style: BASE,
    parentElement: null,
    querySelectorAll: (sel: string) => (sel === '*' ? [] : shapes),
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 50 }),
  });
  for (const s of shapes) s.parentElement = svgRoot;
  vi.stubGlobal('SVGElement', FakeSvgElement);
  vi.stubGlobal('window', { scrollX: 0, scrollY: 0 });
  vi.stubGlobal('getComputedStyle', (el: { style: Style }) => el.style);
  vi.stubGlobal('document', {
    documentElement: {},
    head: { append: () => {} },
    querySelector: () => svgRoot,
    createElement: () => ({ getContext: () => ({}) }),
  });
  return extractPage({ fullPage: false, target: 'svg' }).ops;
}

describe('extractPage on SVG shapes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('draws an axis-aligned rect as a fill and a stroke, scaled into screen space', () => {
    // Arrange
    const rect = shape(
      'rect',
      {
        fill: FILL,
        stroke: STROKE,
        strokeWidth: '1.5',
        strokeOpacity: '0.5',
        opacity: '0.5',
      },
      { x: val(1), y: val(2), width: val(3), height: val(4), rx: val(0.5) },
    );

    // Act
    const ops = extractShapes([rect]);

    // Assert
    expect(ops).toEqual([
      { t: 'r', x: 22, y: 24, w: 6, h: 8, rad: 1, c: [10, 20, 30, 0.5] },
      { t: 's', x: 22, y: 24, w: 6, h: 8, rad: 1, sw: 3, c: [1, 2, 3, 0.25] },
    ]);
  });

  it('draws a circle and an ellipse, keeping a non-scaling stroke at its own width', () => {
    // Arrange
    const circle = shape(
      'circle',
      {
        fill: FILL,
        stroke: STROKE,
        strokeWidth: '1',
        vectorEffect: 'non-scaling-stroke',
      },
      { cx: val(5), cy: val(6), r: val(2) },
    );
    const ellipse = shape(
      'ellipse',
      { fill: FILL, fillOpacity: '0.5', stroke: STROKE },
      { cx: val(0), cy: val(0), rx: val(3), ry: val(1) },
    );

    // Act
    const ops = extractShapes([circle, ellipse]);

    // Assert
    expect(ops).toEqual([
      { t: 'e', x: 30, y: 32, rx: 4, ry: 4, c: [10, 20, 30, 1] },
      { t: 'es', x: 30, y: 32, rx: 4, ry: 4, sw: 1, c: [1, 2, 3, 1] },
      { t: 'e', x: 20, y: 20, rx: 6, ry: 2, c: [10, 20, 30, 0.5] },
    ]);
  });

  it('writes filled SVG text as one text operation and skips unfilled or blank text', () => {
    // Arrange
    const text = (style: Style, textContent: string) =>
      shape('text', style, {
        textContent,
        getStartPositionOfChar: () => ({ x: 1, y: 5 }),
        getBoundingClientRect: () => ({ left: 50 }),
      });

    // Act
    const ops = extractShapes([
      text({ fill: FILL }, '  Hi  '),
      text({}, 'unfilled'),
      text({ fill: FILL }, '   '),
    ]);

    // Assert
    expect(ops).toEqual([
      {
        t: 't',
        x: 40,
        y: 30,
        s: 'Hi',
        lead: 0,
        ff: 'Inter',
        fs: 20,
        fw: '600',
        it: false,
        ls: 0,
        c: [10, 20, 30, 1],
        anchor: 'middle',
      },
    ]);
  });

  it('joins the vertices of a line, polyline and polygon, closing only the polygon', () => {
    // Arrange
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];
    const line = shape(
      'line',
      { stroke: STROKE, strokeWidth: '1' },
      {
        x1: val(0),
        y1: val(0),
        x2: val(1),
        y2: val(1),
        ...along(1.4, () => ({ x: 0, y: 0 })),
      },
    );
    const polyline = shape(
      'polyline',
      { fill: FILL },
      { points: pts, ...along(2, () => ({ x: 0, y: 0 })) },
    );
    const polygon = shape(
      'polygon',
      { fill: FILL },
      { points: pts, ...along(3, () => ({ x: 0, y: 0 })) },
    );

    // Act
    const ops = extractShapes([line, polyline, polygon]);

    // Assert
    expect(ops).toEqual([
      {
        t: 'ps',
        d: 'M20.00 20.00L22.00 22.00',
        sw: 2,
        cap: 'round',
        join: 'miter',
        c: [1, 2, 3, 1],
      },
      { t: 'p', d: 'M20.00 20.00L22.00 20.00L20.00 22.00', c: [10, 20, 30, 1] },
      { t: 'p', d: 'M20.00 20.00L22.00 20.00L20.00 22.00Z', c: [10, 20, 30, 1] },
    ]);
  });

  it('samples a closed single-subpath path at sixteen steps at least and closes it', () => {
    // Arrange
    const path = shape(
      'path',
      { fill: FILL },
      { getAttribute: () => 'M0 0L4 0z', ...along(4, (l) => ({ x: l, y: 0 })) },
    );

    // Act
    const ops = extractShapes([path]);

    // Assert
    const xs = Array.from({ length: 17 }, (_, i) => 20 + i / 2);
    expect(ops).toEqual([{ t: 'p', d: d(xs, 20) + 'Z', c: [10, 20, 30, 1] }]);
  });

  it('lifts the pen across a jump only when the path has several subpaths, and never closes those', () => {
    // Arrange
    const at = (l: number) => ({ x: l <= 1 ? l : 9 + l, y: 0 });
    const multi = shape(
      'path',
      { fill: FILL },
      { getAttribute: () => 'M0 0L1 0M10 0L11 0z', ...along(2, at) },
    );
    const single = shape(
      'path',
      { fill: FILL },
      { getAttribute: () => 'M0 0L11 0', ...along(2, at) },
    );

    // Act
    const ops = extractShapes([multi, single]);

    // Assert
    const xs = Array.from({ length: 17 }, (_, i) => 2 * at((2 * i) / 16).x + 20);
    expect(ops).toEqual([
      { t: 'p', d: d(xs, 20, [9]), c: [10, 20, 30, 1] },
      { t: 'p', d: d(xs, 20), c: [10, 20, 30, 1] },
    ]);
  });

  it('caps a long path at 4000 samples', () => {
    // Arrange
    const path = shape(
      'path',
      { fill: FILL },
      { getAttribute: () => '', ...along(5000, (l) => ({ x: l, y: 0 })) },
    );

    // Act
    const ops = extractShapes([path]);

    // Assert
    expect(ops[0].d.split('L')).toHaveLength(4001);
  });

  it('samples a rotated rect as a path, since only an axis-aligned one stays a rect', () => {
    // Arrange
    const rect = shape(
      'rect',
      { fill: FILL },
      {
        getScreenCTM: () => ({ a: 0, b: 1, c: -1, d: 0, e: 0, f: 0 }),
        getAttribute: () => null,
        ...along(16, (l) => ({ x: l, y: 0 })),
      },
    );

    // Act
    const ops = extractShapes([rect]);

    // Assert
    const xs = Array.from({ length: 17 }, (_, i) => i);
    expect(ops).toEqual([
      {
        t: 'p',
        d: xs.map((x, i) => (i ? 'L' : 'M') + `-10.00 ${(x - 20).toFixed(2)}`).join(''),
        c: [10, 20, 30, 1],
      },
    ]);
  });

  it('draws nothing for a hidden shape, one with no matrix, no length, no length API or no paint', () => {
    // Arrange
    const line = { x1: val(0), y1: val(0), x2: val(1), y2: val(1) };
    const shapes = [
      shape(
        'line',
        { fill: FILL, visibility: 'hidden' },
        { ...line, ...along(1, () => ({ x: 0, y: 0 })) },
      ),
      shape(
        'line',
        { fill: FILL },
        { ...line, getScreenCTM: () => null, ...along(1, () => ({ x: 0, y: 0 })) },
      ),
      shape('line', { fill: FILL }, { ...line, ...along(0, () => ({ x: 0, y: 0 })) }),
      shape('line', { fill: FILL }, line),
      shape('line', { stroke: STROKE }, { ...line, ...along(1, () => ({ x: 0, y: 0 })) }),
    ];

    // Act
    const ops = extractShapes(shapes);

    // Assert
    expect(ops).toEqual([]);
  });
});

/**
 * A text node is measured one character at a time through a Range, so these stand
 * a root element up with one text child and a Range whose rect for character i
 * comes from `at(i)`. The root's box sits at (10, 20), so a viewport point (x, y)
 * lands at (x - 10, y - 20); every font's ascent measures 8.
 */
type CharRect = { left: number; top: number; width: number; height: number };
const TEXT_STYLE: Style = {
  display: 'block',
  visibility: 'visible',
  opacity: '1',
  overflowX: 'visible',
  overflowY: 'visible',
  clipPath: 'none',
  backgroundColor: 'transparent',
  backgroundImage: 'none',
  borderTopStyle: 'none',
  borderRightStyle: 'none',
  borderBottomStyle: 'none',
  borderLeftStyle: 'none',
  color: FILL,
  textTransform: 'none',
  fontFamily: '"Inter", sans-serif',
  fontSize: '10px',
  fontWeight: '600',
  fontStyle: 'normal',
  letterSpacing: 'normal',
};
// Character i sits 5px wide on the first line, starting at the root's left edge.
const inRow = (i: number, top = 20, from = 0): CharRect => ({
  left: 10 + (i - from) * 5,
  top,
  width: 5,
  height: 10,
});
const glyph = (s: string, x: number, y: number) => ({
  t: 't',
  x,
  y,
  s,
  lead: 0,
  ff: 'Inter',
  fs: 10,
  fw: '600',
  it: false,
  ls: 0,
  c: [10, 20, 30, 1],
});

function extractText(
  data: string,
  at: (i: number) => CharRect | null = inRow,
  style: Style = {},
) {
  const node = { nodeType: 3, data };
  const root = {
    tagName: 'DIV',
    style: { ...TEXT_STYLE, ...style },
    parentElement: null,
    childNodes: [node],
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({
      left: 10,
      top: 20,
      width: 100,
      height: 50,
      right: 110,
      bottom: 70,
    }),
  };
  let index = 0;
  vi.stubGlobal('SVGElement', FakeSvgElement);
  vi.stubGlobal('window', { scrollX: 0, scrollY: 0 });
  vi.stubGlobal('getComputedStyle', (el: { style: Style }) => el.style);
  vi.stubGlobal('document', {
    documentElement: {},
    head: { append: () => {} },
    querySelector: () => root,
    createElement: () => ({
      getContext: () => ({ measureText: () => ({ fontBoundingBoxAscent: 8 }) }),
    }),
    createRange: () => ({
      setStart: (_: unknown, i: number) => {
        index = i;
      },
      setEnd: () => {},
      getClientRects: () => {
        const r = at(index);
        return r ? [{ ...r, right: r.left + r.width }] : [];
      },
    }),
  });
  return extractPage({ fullPage: false, target: 'div' }).ops;
}

describe('extractPage on text', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes a line of text as one operation, collapsing its runs of whitespace', () => {
    // Arrange
    const data = 'Ab \t cd ';

    // Act
    const ops = extractText(data, inRow, { opacity: '0.5' });

    // Assert
    expect(ops).toEqual([{ ...glyph('Ab cd', 0, 8), c: [10, 20, 30, 0.5] }]);
  });

  it('starts a new line where the top moves or the pen jumps back, never opening one on whitespace', () => {
    // Arrange: "one" and its space on line 1; a space that wrapped to line 2, then
    // "two" further right than line 1 ended; "six" back at line 2's left edge, as a
    // second column would.
    const data = 'one  twosix';
    const at = (i: number) =>
      i <= 3 ? inRow(i) : i <= 7 ? inRow(i, 32) : inRow(i, 32, 8);

    // Act
    const ops = extractText(data, at);

    // Assert
    expect(ops).toEqual([glyph('one', 0, 8), glyph('two', 25, 20), glyph('six', 0, 20)]);
  });

  it('skips a character with no box, a collapsed whitespace and one centred outside the clip', () => {
    // Arrange: the root clips to its own box, (0, 0)–(100, 50) once scrolled in.
    const data = 'a\nbLRTUc';
    const outside: Record<string, CharRect> = {
      L: { left: 4, top: 20, width: 10, height: 10 },
      R: { left: 106, top: 20, width: 10, height: 10 },
      T: { left: 20, top: 10, width: 5, height: 10 },
      U: { left: 20, top: 66, width: 5, height: 10 },
    };
    const at = (i: number) => {
      const ch = data.charAt(i);
      if (ch === 'b') return null;
      if (ch === '\n') return { ...inRow(i), width: 0 };
      return outside[ch] ?? inRow(i);
    };

    // Act
    const ops = extractText(data, at, { overflowX: 'hidden' });

    // Assert
    expect(ops).toEqual([glyph('ac', 0, 8)]);
  });

  it('applies the text transform and carries the font, its style and its letter spacing', () => {
    // Arrange
    const styles: Style[] = [
      { textTransform: 'uppercase', fontStyle: 'italic', letterSpacing: '1.5px' },
      { textTransform: 'lowercase', fontFamily: "'Mono', monospace", letterSpacing: 'x' },
      { textTransform: 'capitalize' },
    ];

    // Act
    const ops = styles.flatMap((style) => extractText('MiXed', inRow, style));

    // Assert
    expect(ops).toEqual([
      { ...glyph('MIXED', 0, 8), it: true, ls: 1.5 },
      { ...glyph('mixed', 0, 8), ff: 'Mono' },
      glyph('MiXed', 0, 8),
    ]);
  });

  it('writes nothing for blank text, a transparent colour or a hidden parent', () => {
    // Arrange
    const cases: [string, Style][] = [
      [' \n\t ', {}],
      ['Hi', { color: 'transparent' }],
      ['Hi', { visibility: 'hidden' }],
    ];

    // Act
    const ops = cases.flatMap(([data, style]) => extractText(data, inRow, style));

    // Assert
    expect(ops).toEqual([]);
  });
});
