// @ts-check
//
// The comparer: two PNGs in, a verdict out. Pure pixels — no browser, no filesystem and
// no clock — so the whole diff policy is unit-testable against fixtures the suite
// generates itself.
//
// The idea the module exists for: a story that simply got taller and a story that
// repainted are not the same failure, and one diff-pixel count cannot tell them apart.
// A 228px height change on a 1280-wide shot is ~292k pixels the two images do not share,
// which reads as "everything changed" next to the 300 pixels of a real repaint. So the
// two are counted separately, all the way through to the report: pixelmatch sees the
// shared box only, the rest is arithmetic, and sorting is by the shared-box number.

import { Buffer } from 'node:buffer';

import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

import { THRESHOLDS, parseVariantKey } from './policy.mjs';

/** @typedef {import('./capture.mjs').CaptureResult} CaptureResult */
/** @typedef {import('./policy.mjs').Tier} Tier */
/** @typedef {import('./policy.mjs').Theme} Theme */
/** @typedef {import('./policy.mjs').ViewportName} ViewportName */

/** How pixelmatch is asked to compare two shots. One object, never inlined at a call
 *  site: two comparisons run with different settings are two different gates.
 *  @type {{ threshold: number, includeAA: boolean, alpha: number,
 *           diffColor: [number, number, number],
 *           diffColorAlt: [number, number, number] }} */
const PIXELMATCH_OPTIONS = {
  /** Perceptual (YIQ) distance rather than RGB equality — under it the two colours are
   *  one colour to a reader, and a differ that disagrees with the eye is noise. */
  threshold: 0.1,

  /** *The* setting for text-heavy shots. A laptop and the CI container hint glyph edges
   *  differently, and every pixel that differs for that reason is antialiasing rather
   *  than a change anyone can see; counting them reddens the whole corpus. The floor in
   *  {@link THRESHOLDS} covers what still slips through. */
  includeAA: false,

  /** How strongly the unchanged image shows through the diff. Enough to locate the
   *  change on the page, faint enough that the change is what the eye lands on. */
  alpha: 0.1,

  diffColor: [255, 0, 0],

  /** One line, and red confetti becomes a readable signal: pixelmatch paints a pixel
   *  the candidate darkened in this colour and one it lightened in {@link diffColor},
   *  so the diff says which way the UI moved rather than only that it did. */
  diffColorAlt: [0, 255, 0],
};

/** The margin band's colour, deliberately neither of pixelmatch's two: those two mean
 *  "this pixel changed", and the band means "one of the shots has no pixel here at
 *  all". A reader who sees magenta is looking at a story that changed shape. */
export const MARGIN_COLOR = [255, 0, 255];

/** The environment variable that forces both threshold terms to zero.
 *
 *  This, not the threshold, is the anti-flake tool: the nightly job captures the same
 *  commit twice under it, so any pixel that moves without the UI moving is reported
 *  instead of being absorbed by an allowance nobody re-measures. */
export const STRICT_ENV = 'VISUAL_DIFF_STRICT';

/** Whether the run is in strict mode. Exactly `'1'`, never truthiness: the variable
 *  flows through turbo into CI, where `VISUAL_DIFF_STRICT=false` is a string that would
 *  otherwise turn the strictest gate in the repo on.
 *  @param {Record<string, string | undefined>} env
 *  @returns {boolean} */
export function isStrict(env) {
  return env[STRICT_ENV] === '1';
}

/** The allowance a variant has to clear, over the union box.
 *
 *  Two levels because one number cannot serve both ends of the matrix — the reasoning
 *  lives on {@link THRESHOLDS}, which is imported rather than restated. Deliberately not
 *  rounded: rounding either way is a policy change made silently.
 *  @param {number} width @param {number} height @param {boolean} strict
 *  @returns {number} */
export function allowedDiffPixels(width, height, strict) {
  if (strict) return 0;

  return Math.max(THRESHOLDS.maxDiffPixels, THRESHOLDS.maxDiffRatio * width * height);
}

/** @param {{ width: number, height: number }} size */
const shape = ({ width, height }) => `${width}×${height}`;

/** Both shapes, in capture order, or `null` when the shot kept its size. A statement of
 *  what the two images are, never a verdict about the change — that is the split's job.
 *  @param {{ width: number, height: number }} before
 *  @param {{ width: number, height: number }} after
 *  @returns {string | null} */
function formatSizeDelta(before, after) {
  if (before.width === after.width && before.height === after.height) return null;

  return `${shape(before)} → ${shape(after)}`;
}

/** @param {Uint8Array} bytes @returns {PNG} */
const readPng = (bytes) => PNG.sync.read(Buffer.from(bytes));

/** The top-left crop of a shot, so pixelmatch is handed two bitmaps of one size. Top-left
 *  anchored because that is where a page's layout is anchored: content keeps its position
 *  relative to the origin, and a shot that grew grew at the bottom and the right.
 *  @param {PNG} image @param {number} width @param {number} height @returns {PNG} */
function cropTopLeft(image, width, height) {
  if (image.width === width && image.height === height) return image;

  const cropped = new PNG({ width, height });
  PNG.bitblt(image, cropped, 0, 0, width, height, 0, 0);
  return cropped;
}

/** What one pair of shots came to. `diff` is the PNG a human opens; it is produced only
 *  for a failing pair, because the report inlines every diff it is given and a run that
 *  emitted one per unchanged variant would be 25 MB of "still fine".
 *  @typedef {{ pass: boolean, overlapDiffPixels: number, marginPixels: number,
 *              diffPixels: number, allowedDiffPixels: number, width: number,
 *              height: number, sizeDelta: string | null,
 *              diff: Uint8Array | null }} PixelComparison */

/** Compare two shots that may not be the same size.
 *
 *  pixelmatch runs on the shared top-left box alone. Everything outside it differs by
 *  definition — one side has no pixel there — so it is counted here rather than handed
 *  to a comparer that cannot see "missing data" and would compare transparent against
 *  opaque for a platform-dependent answer.
 *  @param {Uint8Array} baseline @param {Uint8Array} candidate
 *  @param {{ strict?: boolean }} [options]
 *  @returns {PixelComparison} */
export function comparePixels(baseline, candidate, { strict = false } = {}) {
  const before = readPng(baseline);
  const after = readPng(candidate);

  const width = Math.max(before.width, after.width);
  const height = Math.max(before.height, after.height);
  const overlapWidth = Math.min(before.width, after.width);
  const overlapHeight = Math.min(before.height, after.height);

  const overlap = new PNG({ width: overlapWidth, height: overlapHeight });
  const overlapDiffPixels = pixelmatch(
    cropTopLeft(before, overlapWidth, overlapHeight).data,
    cropTopLeft(after, overlapWidth, overlapHeight).data,
    overlap.data,
    overlapWidth,
    overlapHeight,
    PIXELMATCH_OPTIONS,
  );

  const marginPixels = width * height - overlapWidth * overlapHeight;
  const diffPixels = overlapDiffPixels + marginPixels;
  const allowed = allowedDiffPixels(width, height, strict);
  const pass = diffPixels <= allowed;

  return {
    pass,
    overlapDiffPixels,
    marginPixels,
    diffPixels,
    allowedDiffPixels: allowed,
    width,
    height,
    sizeDelta: formatSizeDelta(before, after),
    diff: pass ? null : paintDiff(overlap, width, height),
  };
}

/** The diff PNG: the shared box as pixelmatch painted it, on a magenta field the size of
 *  the union box. Painting the band rather than cropping to the shared area keeps every
 *  changed pixel on the image a reviewer opens.
 *  @param {PNG} overlap @param {number} width @param {number} height
 *  @returns {Uint8Array} */
function paintDiff(overlap, width, height) {
  const diff = new PNG({ width, height });
  diff.data.fill(Buffer.from([...MARGIN_COLOR, 255]));
  PNG.bitblt(overlap, diff, 0, 0, overlap.width, overlap.height, 0, 0);

  return PNG.sync.write(diff);
}

/** Every verdict a variant can carry. All but `unchanged` fail the run: `added` and
 *  `removed` are a corpus that moved and need a deliberate accept, `errored` and `a11y`
 *  are defects, and `changed` is the one a human looks at.
 *  @typedef {'unchanged' | 'changed' | 'added' | 'removed' | 'errored' | 'a11y'} Bucket */

/** One row of the report.
 *
 *  `width`/`height` are the union box the allowance was computed over — the candidate's
 *  own size when there was nothing to compare it against, and `null` when no pixels were
 *  measured at all. `tier`, `viewport` and `theme` are `null` only for a baseline whose
 *  filename names no cell of the matrix, which is reported rather than read back as a
 *  variant nothing captures.
 *  @typedef {{ key: string, id: string, tier: Tier | null,
 *              viewport: ViewportName | null, theme: Theme | null,
 *              bucket: Bucket, pass: boolean, overlapDiffPixels: number,
 *              marginPixels: number, diffPixels: number, allowedDiffPixels: number,
 *              width: number | null, height: number | null, sizeDelta: string | null,
 *              violations: CaptureResult['violations'], error: string | null,
 *              diff: Uint8Array | null }} Comparison */

/** The fields a row carries when no pair of shots was compared. Spread, never left to
 *  the reader: a missing count and a count of zero are the same JSON, and the report
 *  must not have to tell them apart.
 *  @type {Pick<Comparison, 'overlapDiffPixels' | 'marginPixels' | 'diffPixels'
 *                        | 'allowedDiffPixels' | 'sizeDelta' | 'diff'>} */
const NOTHING_COMPARED = {
  overlapDiffPixels: 0,
  marginPixels: 0,
  diffPixels: 0,
  allowedDiffPixels: 0,
  sizeDelta: null,
  diff: null,
};

/** What a row is about, wherever it was read from: a capture, or — when nothing was
 *  captured — the baseline key left behind.
 *  @typedef {Pick<Comparison, 'key' | 'id' | 'tier' | 'viewport' | 'theme' | 'width'
 *                           | 'height' | 'violations' | 'error'>} RowSubject */

/** One row. `pass` is derived from the bucket and never passed in: an `a11y` variant
 *  fails whatever its pixels did, so a pixel verdict must not reach `rest`.
 *  @param {RowSubject} subject @param {Bucket} bucket @param {Partial<Comparison>} [rest]
 *  @returns {Comparison} */
const rowFor = (subject, bucket, rest = {}) => ({
  key: subject.key,
  id: subject.id,
  tier: subject.tier,
  viewport: subject.viewport,
  theme: subject.theme,
  bucket,
  pass: bucket === 'unchanged',
  width: subject.width,
  height: subject.height,
  violations: subject.violations,
  error: subject.error,
  ...NOTHING_COMPARED,
  ...rest,
});

/** The bucket a compared pair lands in.
 *
 *  `a11y` outranks the pixel verdict on purpose: axe found a defect with a rule id, and
 *  a variant reported as merely `changed` is one a reviewer can accept by eye — baking
 *  the violation into the baseline, where the differ will never mention it again.
 *  @param {CaptureResult} capture @param {boolean} pass @returns {Bucket} */
function bucketOf(capture, pass) {
  if (capture.bucket === 'a11y') return 'a11y';

  return pass ? 'unchanged' : 'changed';
}

/** One capture against the baseline it was matched to.
 *
 *  Order matters: a capture that failed and a capture with no pixels have nothing to
 *  compare, and a variant with no baseline is a corpus question — whether its pixels are
 *  also different is not answerable and not asked.
 *  @param {CaptureResult} capture @param {Uint8Array | undefined} baseline
 *  @param {boolean} strict @returns {Comparison} */
function compareCapture(capture, baseline, strict) {
  if (capture.bucket === 'errored') return rowFor(capture, 'errored');
  if (!capture.bytes) {
    return rowFor(capture, 'errored', { error: 'the capture produced no PNG' });
  }
  if (!baseline) return rowFor(capture, 'added');

  const { pass, ...pixels } = comparePixels(baseline, capture.bytes, { strict });
  return rowFor(capture, bucketOf(capture, pass), pixels);
}

/** A baseline no capture claimed: a story that was deleted, one that was renamed, or a
 *  capture that never ran. Only `accept` prunes these — `check` reports them, because
 *  the three are indistinguishable from here and two of them are bugs.
 *  @param {string} key @returns {Comparison} */
function removedBaseline(key) {
  const variant = parseVariantKey(key);

  return rowFor(
    {
      key,
      id: variant?.id ?? key,
      tier: variant?.tier ?? null,
      viewport: variant?.viewport ?? null,
      theme: variant?.theme ?? null,
      width: null,
      height: null,
      violations: [],
      error: variant ? null : `${key} names no cell of the capture matrix`,
    },
    'removed',
  );
}

/** Code-unit order, never `localeCompare`: collation depends on the ICU build the host
 *  ships, and this is the tiebreak two runs of one corpus have to agree on.
 *  @param {string} left @param {string} right */
function compareKeys(left, right) {
  if (left === right) return 0;

  return left < right ? -1 : 1;
}

/** Worst first, and worst means the shared box: sorting by `diffPixels` would let a
 *  story that only got taller outrank every real repaint in the run, which is the report
 *  reading "everything changed" on the day one padding value moved. Ties break on the
 *  key so two runs over one corpus produce the same order.
 *  @param {Comparison} left @param {Comparison} right */
const worstFirst = (left, right) =>
  right.overlapDiffPixels - left.overlapDiffPixels || compareKeys(left.key, right.key);

/** Compare a whole capture run against the committed baselines.
 *
 *  `baselines` is keyed by `policy.variantKey`, the same name the capture plan carries,
 *  so a key present on one side and absent on the other is exactly the `added`/`removed`
 *  question — no filename is parsed twice.
 *  @param {{ captures: readonly CaptureResult[],
 *            baselines: ReadonlyMap<string, Uint8Array>,
 *            env?: Record<string, string | undefined> }} run
 *  @returns {Comparison[]} */
export function compareAll({ captures, baselines, env = process.env }) {
  const strict = isStrict(env);
  const captured = new Set(captures.map((capture) => capture.key));

  const compared = captures.map((capture) =>
    compareCapture(capture, baselines.get(capture.key), strict),
  );
  const removed = [...baselines.keys()]
    .filter((key) => !captured.has(key))
    .map(removedBaseline);

  return [...compared, ...removed].sort(worstFirst);
}
