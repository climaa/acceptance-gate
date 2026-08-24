import type { Bucket, Variant } from './summary';

/**
 * The three PNGs one variant can have, and the URL each is served from.
 *
 * `summary.json` records the numbers, never the files, so which shots exist is
 * derived here — from the producer's own rules, not from what a request happens
 * to answer. A frame pointed at a shot the run never wrote is a broken image
 * exactly where a reviewer went looking for evidence.
 */

export type ShotKind = 'baseline' | 'candidate' | 'diff';

/**
 * One shot, on the immutable route #275 serves it from.
 *
 * Never a data URI: a report id names one run's artifacts and a run never
 * writes twice, so the route answers `immutable` and the browser's cache does
 * the work — inlining the bytes would re-send every shot with every render of
 * the page they are already held for.
 */
export const shotUrl = (reportId: string, key: string, kind: ShotKind) =>
  `/api/shots/${encodeURIComponent(reportId)}/${encodeURIComponent(`${key}.${kind}.png`)}`;

/**
 * Whether the differ painted a diff for this pair.
 *
 * `comparePixels` writes one only when the pair failed its allowance — the
 * report inlines every diff it is given, and a run that emitted one per
 * matching variant would be megabytes of "still fine". The comparison is that
 * same rule, read back off the row.
 */
const painted = (variant: Variant) => variant.diffPixels > variant.allowedDiffPixels;

/** `added` is a story the baseline set never had — there is nothing behind it. */
const noBaseline = (bucket: Bucket) => bucket === 'added';

/** `removed` has no candidate left, and an `errored` capture produced no PNG. */
const noCandidate = (bucket: Bucket) => bucket === 'removed' || bucket === 'errored';

/**
 * Whether the differ had two shots to put against each other — the one
 * precondition for everything that sets one side against the other.
 *
 * Two kinds of caller ask it. Anything that quotes a pixel count: where no pair
 * was compared the row carries `compare.mjs`'s `NOTHING_COMPARED`, zeros meaning
 * "nothing was measured" rather than "measured, and identical". A missing count
 * and a count of zero are the same JSON and the opposite report, so `0 px differ
 * in the shared area` under a story with no baseline reports a clean shared area
 * that never existed. And anything that alternates or overlays the two sides: a
 * blink with one shot has nothing to alternate, a split has a divider over an
 * empty half.
 *
 * Asked of the bucket rather than of a built `ShotSources`, so a caller that has
 * only the variant need not mint URLs to find out. It is the same answer either
 * way — `shotSources` below decides both sides from these same two predicates.
 */
export const compared = (bucket: Bucket) => !noBaseline(bucket) && !noCandidate(bucket);

/** The three shots, `undefined` where the run wrote none. */
export type ShotSources = Record<ShotKind, string | undefined>;

/**
 * The shots this variant has, keyed by kind, `undefined` where the run wrote
 * none.
 *
 * A story that is only on one side has one shot and nothing to compare it to:
 * `added` never had a baseline, `removed` has no candidate left, and an
 * `errored` capture produced no PNG at all — which is why its row carries the
 * capture's own message instead of a picture.
 */
export function shotSources(reportId: string, variant: Variant): ShotSources {
  const at = (kind: ShotKind) => shotUrl(reportId, variant.key, kind);

  const baseline = noBaseline(variant.bucket) ? undefined : at('baseline');
  const candidate = noCandidate(variant.bucket) ? undefined : at('candidate');

  return {
    baseline,
    candidate,
    diff: baseline && candidate && painted(variant) ? at('diff') : undefined,
  };
}

/** The frame copy for a side the comparison never had. Pinned: the story is not
 *  in that capture set, which is a corpus fact rather than a pixel one. */
const NOT_ON_THIS_SIDE = 'not on this side';

/** …and for the diff. One side missing is not "no difference" — it is nothing
 *  to difference, and the differ paints no PNG for it. */
const NOTHING_TO_COMPARE = 'nothing to compare';

/** The capture itself failed, so there are no pixels to show. The row that
 *  frames it carries what the browser said instead. */
const NO_SHOT_CAPTURED = 'no shot captured';

/**
 * Why a frame is empty, in the reviewer's own words.
 *
 * An empty box reads as a shot that failed to load, and "this story is not on
 * that side", "the capture crashed" and "there was nothing to difference" are
 * three different reports. Both surfaces — the card's viewer and the modal —
 * say it the same way, from here.
 */
export function absentShotCopy(variant: Variant, kind: ShotKind): string {
  if (kind === 'diff') return NOTHING_TO_COMPARE;
  if (variant.bucket === 'errored') return NO_SHOT_CAPTURED;

  return NOT_ON_THIS_SIDE;
}
