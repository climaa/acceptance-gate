// @ts-check
//
// The pure half of tiles-from-dom: pairs a story's light and dark drawing operations,
// gives every colour a palette slot, and writes one tile as an SVG Pen can paste.
//
// Pen turns a pasted SVG into frames, rectangles, paths and texts but knows nothing of
// design tokens, so each colour in the SVG is a sentinel, `#FFSSPP`:
//   FF  0 both themes · 1 light only · 2 dark only (an icon that swaps with the theme)
//   SS  the text style (letter spacing), which Pen's SVG import drops
//   PP  the palette slot + 1, a [light, dark] pair the place snippet names by the
//       design token whose two values match
// The alpha rides along as fill-opacity. A first text, `TILE:<variant key>`, tells the
// place snippet which tile the pasted frame belongs to.

/** @typedef {[number, number, number, number]} Rgba */
/** @typedef {{ t: string, c: Rgba | null, x?: number, y?: number, w?: number, h?: number,
 *   rx?: number, ry?: number, rad?: number, sw?: number, d?: string, s?: string,
 *   ff?: string, fs?: number, fw?: string, it?: boolean, ls?: number, cap?: string,
 *   join?: string, src?: string, img?: string }} Op */
/** @typedef {{ op: Op, light: Rgba | null, dark: Rgba | null, flag: 0 | 1 | 2 }} Pair */

/** Operations Pen cannot draw from an SVG; reported, never written. */
export const UNDRAWN = new Set(['img', 'g']);

/** The key two renders of one story share for the same operation: its kind, its
 *  rounded box and its text or path. A colour is deliberately not part of it.
 *  @param {Op} op */
export const opKey = (op) =>
  [
    op.t,
    Math.round(op.x ?? 0),
    Math.round(op.y ?? 0),
    Math.round(op.w ?? op.rx ?? 0),
    Math.round(op.h ?? op.ry ?? 0),
    op.s ?? '',
    (op.d ?? '').slice(0, 40),
  ].join('|');

/** Every light operation with its dark twin. One with no twin is drawn for its own
 *  theme only, which is how an icon that changes with the theme survives the trip.
 *  @param {Op[]} light @param {Op[]} dark @returns {Pair[]} */
export function pairThemes(light, dark) {
  /** @type {Map<string, number[]>} */
  const byKey = new Map();
  dark.forEach((op, i) => {
    const key = opKey(op);
    byKey.set(key, [...(byKey.get(key) ?? []), i]);
  });
  const used = new Set();
  /** @type {Pair[]} */
  const pairs = light.map((op) => {
    const twin = byKey.get(opKey(op))?.find((i) => !used.has(i));
    if (twin === undefined) return { op, light: op.c, dark: null, flag: 1 };
    used.add(twin);
    return { op, light: op.c, dark: dark[twin].c, flag: 0 };
  });
  dark.forEach((op, i) => {
    if (!used.has(i)) pairs.push({ op, light: null, dark: op.c, flag: 2 });
  });
  return pairs;
}

/** @param {Rgba | null} c @returns {string | null} */
export const hex = (c) =>
  c
    ? '#' +
      c
        .slice(0, 3)
        .map((v) => Math.round(v).toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()
    : null;

/** Grows a palette of [light, dark] pairs and a table of text styles, shared by every
 *  tile written in one run so the place snippet needs one copy of each. */
export function createTables() {
  /** @type {[string | null, string | null][]} */
  const palette = [];
  /** @type {number[]} */
  const styles = [0];
  return {
    palette,
    styles,
    /** @param {Pair} pair */
    slot(pair) {
      const entry = [hex(pair.light), hex(pair.dark)];
      let i = palette.findIndex(([l, d]) => l === entry[0] && d === entry[1]);
      if (i < 0)
        i = palette.push(/** @type {[string | null, string | null]} */ (entry)) - 1;
      if (i > 254) throw new Error('more than 255 colour pairs in one run');
      return i;
    },
    /** @param {Op} op */
    style(op) {
      const ls = op.t === 't' ? (op.ls ?? 0) : 0;
      let i = styles.indexOf(ls);
      if (i < 0) i = styles.push(ls) - 1;
      return i;
    },
  };
}

/** @param {number} flag @param {number} style @param {number} slot */
export const sentinel = (flag, style, slot) =>
  '#' + [flag, style, slot + 1].map((v) => v.toString(16).padStart(2, '0')).join('');

/** The inverse, as the place snippet reads a pasted colour back (Pen may shorten a
 *  sentinel to three or four digits, and appends the alpha as two more).
 *  @param {string} colour */
export function readSentinel(colour) {
  let h = colour.slice(1);
  if (h.length <= 4) h = [...h].map((c) => c + c).join('');
  const byte = (i) => parseInt(h.slice(i, i + 2), 16);
  return {
    flag: byte(0),
    style: byte(2),
    slot: byte(4) - 1,
    alpha: h.length > 6 ? byte(6) / 255 : 1,
  };
}

const n2 = (v) => +(v ?? 0).toFixed(2);
/** @param {string} s */
const esc = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** One operation as an SVG element.
 *  @param {Op} o @param {string} colour @param {number} alpha */
export function element(o, colour, alpha) {
  const fo = alpha < 0.999 ? ` fill-opacity="${+alpha.toFixed(3)}"` : '';
  const so = alpha < 0.999 ? ` stroke-opacity="${+alpha.toFixed(3)}"` : '';
  const box = `x="${n2(o.x)}" y="${n2(o.y)}" width="${n2(o.w)}" height="${n2(o.h)}"${o.rad ? ` rx="${n2(o.rad)}"` : ''}`;
  const oval = `cx="${n2(o.x)}" cy="${n2(o.y)}" rx="${n2(o.rx)}" ry="${n2(o.ry)}"`;
  const stroke = `fill="none" stroke="${colour}" stroke-width="${n2(o.sw)}"${so}`;
  switch (o.t) {
    case 'r':
      return `<rect ${box} fill="${colour}"${fo}/>`;
    case 's':
      return `<rect ${box} ${stroke}/>`;
    case 'e':
      return `<ellipse ${oval} fill="${colour}"${fo}/>`;
    case 'es':
      return `<ellipse ${oval} ${stroke}/>`;
    case 'p':
      return `<path d="${o.d}" fill="${colour}"${fo}/>`;
    case 'ps':
      return `<path d="${o.d}" ${stroke} stroke-linecap="${o.cap}" stroke-linejoin="${o.join}"/>`;
    case 't':
      return (
        `<text x="${n2(o.x)}" y="${n2(o.y)}" font-family="${esc(o.ff ?? '')}" font-size="${n2(o.fs)}"` +
        ` font-weight="${o.fw}"${o.ls ? ` letter-spacing="${o.ls}"` : ''}${o.it ? ' font-style="italic"' : ''}` +
        ` fill="${colour}"${fo} xml:space="preserve">${esc(o.s ?? '')}</text>`
      );
    default:
      throw new Error(`no SVG element for operation "${o.t}"`);
  }
}

/** One tile: its marker, then every paired operation in paint order.
 *  @param {{ key: string, size: [number, number], pairs: Pair[],
 *    tables: ReturnType<typeof createTables> }} tile
 *  @returns {{ svg: string, undrawn: string[] }} */
export function renderTile({ key, size, pairs, tables }) {
  const [w, h] = size.map(Math.round);
  const undrawn = [];
  const body = [];
  for (const pair of pairs) {
    if (UNDRAWN.has(pair.op.t)) {
      const what = `${pair.op.t === 'img' ? 'image' : 'gradient'} ${(pair.op.src ?? pair.op.img ?? '').slice(0, 60)}`;
      if (!undrawn.includes(what)) undrawn.push(what);
      continue;
    }
    const colour = sentinel(pair.flag, tables.style(pair.op), tables.slot(pair));
    body.push(
      element(pair.op, colour, (pair.flag === 2 ? pair.dark : pair.light)?.[3] ?? 1),
    );
  }
  const marker = `<text x="0" y="4" font-size="4" fill="#030000">TILE:${key}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${marker}${body.join('')}</svg>`;
  return { svg, undrawn };
}

/** The light render of a sentinel SVG, for previewing a tile against its baseline
 *  without Pen: each sentinel back to its light colour, dark-only elements dropped.
 *  @param {string} svg @param {[string | null, string | null][]} palette */
export function lightPreview(svg, palette) {
  return svg
    .replace(/<text[^>]*>TILE:[^<]*<\/text>/, '')
    .replace(
      /<(\w+)([^>]*?)(fill|stroke)="(#[0-9a-f]{6})"([^>]*?)(\/>|>[^<]*<\/text>)/g,
      (all, tag, a, prop, c, b, end) => {
        const { flag, slot } = readSentinel(c);
        if (flag === 2) return '';
        return `<${tag}${a}${prop}="${palette[slot][0]}"${b}${end}`;
      },
    );
}
