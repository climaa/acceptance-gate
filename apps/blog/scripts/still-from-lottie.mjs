// @ts-check
/**
 * Draws the reduced-motion still from the animation it stands in for.
 *
 * `LottieBlock` does not load the player when a reader has asked for less
 * movement — no renderer, no wasm, no state machine — so something has to be on
 * screen instead, and it has to be the same picture the animation rests on or
 * the control changes shape depending on a browser setting.
 *
 * Generated rather than hand-drawn, and that is the whole point of the file. A
 * still traced by eye is correct exactly once: the next re-export from Creator
 * moves the artwork and nothing anywhere says the SVG beside it no longer
 * matches. This reads frame 0 out of the shipped `.lottie` and emits it, so
 * regenerating is the one step that keeps them honest.
 *
 * Colours come out as token variables, not as the hex the file carries. Every
 * shape in the animation names its theme slot (`sid`), the slots map to the
 * design tokens one-to-one, and emitting the variable is what lets the still
 * follow `[data-theme]` with no observer, no second copy of the palette, and no
 * chance of the still and the animation disagreeing about what "accent" means.
 *
 * Usage: node apps/blog/scripts/still-from-lottie.mjs
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const LOTTIE = resolve(here, '../public/lottie/changelog-sync.lottie');
const OUT = resolve(here, '../components/ChangelogSyncStill.tsx');

/** The animation inside the archive. One entry in the manifest, one name here. */
const ANIMATION = 'a/Main Scene.json';

/** The frame the control rests on — `s-idle`'s segment starts here. */
const FRAME = 0;

/**
 * The theme slots the artwork paints with, and the token each one is. Both
 * halves are decided elsewhere: the slots in the Creator file, the tokens in
 * `packages/ui/src/tokens.css`. This is only where they are tied together, and
 * an unmapped slot throws rather than defaulting — a still that quietly painted
 * a new slot black would be a drawing bug nobody would think to look for.
 */
/** @type {Record<string, string | undefined>} */
const TOKENS = {
  'gate-outline': '--color-text',
  'gate-outline-muted': '--color-border-strong',
  'gate-surface': '--color-bg-subtle',
  'gate-line': '--color-text-muted',
  'gate-accent': '--color-accent',
  'gate-success': '--color-success-fg',
  'gate-danger': '--color-danger-fg',
};

/** The layer that exists only to catch pointer events — never drawn. */
const HIT_AREA = 'hit-area';

/** An [x, y] pair, which is how Lottie writes every position, size and tangent.
 *  @typedef {[number, number]} Pair */

/** A Lottie animatable property: `a: 0` carries `k` directly, `a: 1` carries keyframes.
 *  @typedef {{ a: 0 | 1, k: any }} Property */

/** One bezier shape's geometry, tangents relative to their own vertex.
 *  @typedef {{ v: Pair[], i: Pair[], o: Pair[], c: boolean }} Bezier */

/** One entry in a layer's `shapes`: a geometry (`sh`/`el`/`rc`) or a paint (`fl`/`st`).
 *  @typedef {{ ty: string, ks?: Property, s?: Property, p?: Property, r?: Property,
 *              w?: Property, lc?: number, lj?: number,
 *              c?: { sid?: string } }} Shape */

/** One layer of the composition.
 *  @typedef {{ nm: string, hd?: boolean, shapes?: Shape[],
 *              ks: { p: Property, a: Property, s: Property, r: Property,
 *                    o: Property } }} Layer */

/** The animation document.
 *  @typedef {{ w: number, h: number, layers: Layer[] }} Animation */

/** The SVG attributes one shape list paints with.
 *  @typedef {Record<string, string | number>} Paint */

/** Lottie's line-cap and line-join enums, in SVG's words.
 *  @type {Record<number, string | undefined>} */
const CAPS = { 1: 'butt', 2: 'round', 3: 'square' };

/** @type {Record<number, string | undefined>} */
const JOINS = { 1: 'miter', 2: 'round', 3: 'bevel' };

/**
 * One entry out of the `.lottie`, which is a zip.
 *
 * Read with `node:zlib` rather than by shelling out to `unzip`, because the
 * drift check in `__tests__/changelog-sync-still.test.ts` calls `build()` and
 * has to run wherever the suite runs. A test that depends on a binary being
 * installed is a test that reports the runner's contents as a defect in the
 * artwork.
 *
 * The central directory is what is walked, never the local headers: a local
 * header is allowed to carry zeroes for both sizes and defer them to a trailing
 * data descriptor, and the central directory always has the real ones.
 *
 * @param {Buffer} archive @param {string} name @returns {string} */
function unzipEntry(archive, name) {
  const end = archive.lastIndexOf('PK\x05\x06', archive.length, 'latin1');
  if (end < 0) throw new Error(`${LOTTIE} is not a zip archive.`);

  let cursor = archive.readUInt32LE(end + 16);
  const entries = archive.readUInt16LE(end + 10);

  for (let n = 0; n < entries; n += 1) {
    const nameLength = archive.readUInt16LE(cursor + 28);
    const entryName = archive.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    const compressed = archive.readUInt32LE(cursor + 20);
    const localOffset = archive.readUInt32LE(cursor + 42);

    if (entryName === name) {
      const localNames = archive.readUInt16LE(localOffset + 26);
      const localExtra = archive.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNames + localExtra;
      const body = archive.subarray(start, start + compressed);

      // Method 0 is stored; 8 is deflate, which is what Creator writes.
      const method = archive.readUInt16LE(cursor + 10);
      return method === 0 ? body.toString('utf8') : inflateRawSync(body).toString('utf8');
    }

    cursor +=
      46 +
      nameLength +
      archive.readUInt16LE(cursor + 30) +
      archive.readUInt16LE(cursor + 32);
  }

  throw new Error(`${name} is not in ${LOTTIE}.`);
}

/** @returns {Animation} */
function readAnimation() {
  return JSON.parse(unzipEntry(readFileSync(LOTTIE), ANIMATION));
}

/**
 * A property's value at `FRAME`.
 *
 * Static properties (`a: 0`) carry their value directly. Animated ones carry
 * keyframes, and this takes the last one at or before the frame rather than
 * interpolating: frame 0 is a keyframe on every animated property in this file,
 * so there is nothing between to interpolate, and a tweening implementation
 * would be untested code standing in for arithmetic that never runs.
 *
 * @param {Property | undefined} property @returns {any} */
function valueAt(property) {
  if (!property) return null;
  if (property.a === 0) return property.k;

  const keyframes = property.k;
  let value = keyframes[0].s;
  for (const keyframe of keyframes) {
    if (keyframe.t <= FRAME && keyframe.s !== undefined) value = keyframe.s;
  }
  return value;
}

/** @param {Property | undefined} property @param {number} fallback @returns {number} */
function scalarAt(property, fallback) {
  const value = valueAt(property);
  if (value === null) return fallback;
  return Array.isArray(value) ? value[0] : value;
}

/** `1.5` not `1.5000000000000002` — the SVG is read by people. */
/** @param {number} n @returns {number} */
function round(n) {
  return Number(n.toFixed(2));
}

/** @param {Pair} pair @returns {string} */
function point([x, y]) {
  return `${round(x)} ${round(y)}`;
}

/**
 * One entry of a shape's point arrays.
 *
 * Throws rather than defaulting. A bezier whose `v`, `i` and `o` arrays are not
 * the same length is a malformed file, and the alternative to failing here is
 * emitting `NaN` into a path — an SVG that renders as nothing at all, from an
 * asset that looked like it converted fine.
 *
 * @param {Pair[]} points @param {number} index @returns {Pair} */
function at(points, index) {
  const found = points[index];
  if (!found) throw new Error(`A path in ${ANIMATION} has no point at index ${index}.`);
  return found;
}

/** @param {string | undefined} sid @returns {string} */
function token(sid) {
  if (!sid) throw new Error('A shape carries a colour with no theme slot.');
  const name = TOKENS[sid];
  if (!name) throw new Error(`Unmapped theme slot: ${sid}`);
  return `var(${name})`;
}

/**
 * One bezier path, in SVG's `d`.
 *
 * Lottie stores tangents relative to the vertex they belong to; SVG wants
 * absolute control points. Every segment is emitted as a cubic even when both
 * tangents are zero — which is most of this artwork — because a cubic with
 * coincident controls IS the straight line, and branching to `L` would only add
 * a case to get wrong.
 *
 * @param {Bezier} bezier @returns {string} */
function pathData({ v, i, o, c }) {
  /** @param {Pair} a @param {Pair} b @returns {Pair} */
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const segments = [`M ${point(at(v, 0))}`];

  for (let n = 1; n < v.length; n += 1) {
    const from = point(add(at(v, n - 1), at(o, n - 1)));
    const to = point(add(at(v, n), at(i, n)));
    segments.push(`C ${from} ${to} ${point(at(v, n))}`);
  }

  if (c) {
    const last = v.length - 1;
    const from = point(add(at(v, last), at(o, last)));
    const to = point(add(at(v, 0), at(i, 0)));
    segments.push(`C ${from} ${to} ${point(at(v, 0))} Z`);
  }

  return segments.join(' ');
}

/** The paint attributes a shape list applies to every geometry in it.
 *  @param {Shape[]} shapes @returns {Paint} */
function paintOf(shapes) {
  const fill = shapes.find((s) => s.ty === 'fl');
  const stroke = shapes.find((s) => s.ty === 'st');

  const paint = { fill: fill ? token(fill.c?.sid) : 'none' };
  if (!stroke) return paint;

  return {
    ...paint,
    stroke: token(stroke.c?.sid),
    // React's own spelling for these. The hyphenated SVG names render, but React
    // warns on each one, and a generated file that prints a console warning per
    // shape on every reduced-motion render is noise nobody can act on.
    strokeWidth: round(scalarAt(stroke.w, 0)),
    strokeLinecap: CAPS[stroke.lc ?? 0] ?? 'butt',
    strokeLinejoin: JOINS[stroke.lj ?? 0] ?? 'miter',
  };
}

/** @param {Paint} pairs @returns {string} */
function attributes(pairs) {
  return Object.entries(pairs)
    .map(([name, value]) => `${name}="${value}"`)
    .join(' ');
}

/** One geometry, as an SVG element. Returns null for the paint entries.
 *  @param {Shape} shape @param {Paint} paint @returns {string | null} */
function geometry(shape, paint) {
  if (shape.ty === 'sh') {
    return `<path ${attributes({ d: pathData(valueAt(shape.ks)), ...paint })} />`;
  }
  if (shape.ty === 'el') {
    const [w, h] = valueAt(shape.s);
    const [cx, cy] = valueAt(shape.p);
    return `<ellipse ${attributes({ cx: round(cx), cy: round(cy), rx: round(w / 2), ry: round(h / 2), ...paint })} />`;
  }
  if (shape.ty === 'rc') {
    const [w, h] = valueAt(shape.s);
    const [cx, cy] = valueAt(shape.p);
    const r = round(scalarAt(shape.r, 0));
    const box = {
      x: round(cx - w / 2),
      y: round(cy - h / 2),
      width: round(w),
      height: round(h),
    };
    return `<rect ${attributes({ ...box, ...(r ? { rx: r } : {}), ...paint })} />`;
  }
  return null;
}

/** The layer's own transform, as one SVG transform list — omitted when it is identity.
 *  @param {Layer['ks']} ks @returns {string} */
function layerTransform(ks) {
  const [px, py] = valueAt(ks.p) ?? [0, 0];
  const [ax, ay] = valueAt(ks.a) ?? [0, 0];
  const [sx, sy] = valueAt(ks.s) ?? [100, 100];
  const rotation = scalarAt(ks.r, 0);

  const parts = [];
  if (px || py) parts.push(`translate(${point([px, py])})`);
  if (rotation) parts.push(`rotate(${round(rotation)})`);
  if (sx !== 100 || sy !== 100)
    parts.push(`scale(${round(sx / 100)} ${round(sy / 100)})`);
  if (ax || ay) parts.push(`translate(${point([-ax, -ay])})`);

  return parts.join(' ');
}

/** One drawn layer, or null when nothing of it is visible at this frame.
 *  @param {Layer} layer @returns {string | null} */
function layerMarkup(layer) {
  if (layer.nm === HIT_AREA || layer.hd) return null;

  const opacity = scalarAt(layer.ks.o, 100);
  if (opacity <= 0) return null;

  const shapes = layer.shapes ?? [];
  const paint = paintOf(shapes);
  const drawn = shapes.map((shape) => geometry(shape, paint)).filter(Boolean);
  if (drawn.length === 0) return null;

  const group = {
    ...(layerTransform(layer.ks) ? { transform: layerTransform(layer.ks) } : {}),
    ...(opacity < 100 ? { opacity: round(opacity / 100) } : {}),
  };

  const open = Object.keys(group).length ? `<g ${attributes(group)}>` : '<g>';
  return `      {/* ${layer.nm} */}\n      ${open}\n        ${drawn.join('\n        ')}\n      </g>`;
}

/**
 * The still, as source text.
 *
 * Exported so the drift check can call it and compare against the file checked
 * in beside it — which is what turns "regenerate after a re-export" from a note
 * in a comment into something the suite enforces.
 *
 * @returns {string} */
export function build() {
  const animation = readAnimation();

  // Lottie paints the LAST layer first; SVG paints in document order. Reversed
  // here rather than in the reader, so the emitted file reads back-to-front the
  // way an illustration does.
  const layers = [...animation.layers].reverse().map(layerMarkup).filter(Boolean);

  return `/* GENERATED FILE — do not edit.
 *
 * Frame ${FRAME} of public/lottie/changelog-sync.lottie, which is what a reader
 * with \`prefers-reduced-motion: reduce\` sees in place of the animation. Colours
 * are the design tokens the animation's own theme slots map to, so this follows
 * \`[data-theme]\` without a second palette to keep in step.
 *
 * Regenerate after every re-export of the .lottie:
 *   node apps/blog/scripts/still-from-lottie.mjs
 */

/** The resting frame of the changelog sync icon, drawn rather than played. */
export function ChangelogSyncStill() {
  return (
    <svg
      viewBox="0 0 ${animation.w} ${animation.h}"
      width="100%"
      height="100%"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
${layers.join('\n')}
    </svg>
  );
}
`;
}

/** The file this generator writes, so the check can read the same path. */
export const STILL_PATH = OUT;

function write() {
  writeFileSync(OUT, build());

  // Formatted by the same Prettier the gate's `format` check runs, rather than by
  // this file guessing at its width and quoting. A generated file is still a
  // checked-in file: it has to satisfy the same check as everything around it, or
  // regenerating it turns the gate red for reasons that have nothing to do with
  // the change that prompted it.
  execFileSync('pnpm', ['exec', 'prettier', '--write', OUT], { stdio: 'inherit' });

  console.log(`Wrote ${OUT}`);
}

// Only when run as a command. Imported — by the drift check — this file defines
// `build()` and writes nothing.
if (process.argv[1] === fileURLToPath(import.meta.url)) write();
