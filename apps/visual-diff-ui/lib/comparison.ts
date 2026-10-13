import type { Variant } from './summary';

/**
 * The comparison surface's vocabulary: how a reviewer can look at one pair of
 * shots, and where the divider stands while they do.
 *
 * Framework-free, because these are the words the whole feature is asserted by
 * — the toolbar's button names, the `mode` search param and the modal's stage
 * all read them from here. A mode spelled twice is a mode that can drift, and a
 * drifted name is a control an end-to-end scenario can no longer find.
 */

/**
 * Every mode, in the order the toolbar draws them: the three shots first, then
 * the two ways of looking at both at once, then the one that stops scaling
 * them. Board 04 draws exactly this row.
 */
export const COMPARISON_MODES = [
  'baseline',
  'candidate',
  'diff',
  'blink',
  'slider',
  'actual size',
] as const;

export type ComparisonMode = (typeof COMPARISON_MODES)[number];

/**
 * 1:1 CSS pixels, which a phone reaches by pinching instead.
 *
 * Absent below the breakpoint rather than disabled: pinch-zoom is the native
 * gesture for exactly this, and a control that duplicates a gesture the
 * platform already owns is a control that will disagree with it.
 */
const ACTUAL_SIZE: ComparisonMode = 'actual size';

/** What a link carrying a story but no mode opens in: the picture the run
 *  itself produced as its verdict. */
export const DEFAULT_MODE: ComparisonMode = 'diff';

/** The modes offered at this width. */
export const modesFor = (wide: boolean): readonly ComparisonMode[] =>
  wide ? COMPARISON_MODES : COMPARISON_MODES.filter((mode) => mode !== ACTUAL_SIZE);

export const isComparisonMode = (value: string | null): value is ComparisonMode =>
  COMPARISON_MODES.some((mode) => mode === value);

/** The divider's resting place: half of each shot, which is the split that
 *  claims nothing about where the difference is. */
export const MIDPOINT = 50;

/** How far one arrow key moves the divider. A percent per press would need
 *  fifty of them to cross the shot; five moves visibly and still lands on the
 *  midpoint from either end. */
export const SCRUB_STEP = 5;

/** Keeps a position inside the shot it splits. */
export const clampPosition = (position: number) =>
  Math.min(100, Math.max(0, Math.round(position)));

/**
 * The variants the comparison surface can show.
 *
 * An `a11y` variant is not one of them: its finding is a rule id and a node
 * count, its two shots can be byte-identical, and a modal that framed them
 * would be offering to review a violation by eye — which is the one thing the
 * report says all the way through that reviewing cannot do.
 */
export const comparableVariants = (variants: readonly Variant[]) =>
  variants.filter((variant) => variant.bucket !== 'a11y');

/**
 * The variant a `story` parameter names.
 *
 * The key first — it is what the modal writes, and the only value that names
 * one viewport/theme pair — then the story id, so a link written by hand, or by
 * something that only knows the slug, still lands on that story's worst
 * variant rather than on nothing.
 */
export const variantByParam = (variants: readonly Variant[], story: string) =>
  variants.find((variant) => variant.key === story) ??
  variants.find((variant) => variant.id === story) ??
  null;

/**
 * Where one comparison lives: `/report/<id>/compare/<variantKey>`.
 *
 * A path rather than the `?story=` it replaced, for two readers the query string
 * could not serve. The analytics beacon counts a pageview when the pathname
 * moves and never when only the query does, so a comparison that was a query
 * parameter was invisible to it. And a link preview is a page's own `<head>`:
 * a comparison with an address of its own can carry a title and a card of its
 * own, which a report URL with a parameter on it cannot.
 *
 * The key, never the story id. The key is the only value that names one
 * viewport/theme pair, so it is the one address a comparison has — the proxy
 * redirects every other spelling onto it.
 */
export const comparisonPath = (reportId: string, key: string) =>
  `/report/${encodeURIComponent(reportId)}/compare/${encodeURIComponent(key)}`;

/**
 * …with the mode, when it is not the one the modal opens on anyway.
 *
 * The mode rides the query string because it is how a comparison is being
 * looked at, not which comparison it is: switching it is not a new page, so it
 * must not be a new pageview either. The default is left out so that one
 * comparison has one bare link.
 */
export function comparisonHref(
  reportId: string,
  key: string,
  mode: ComparisonMode | null = null,
): string {
  const at = comparisonPath(reportId, key);
  if (mode === null || mode === DEFAULT_MODE) return at;

  return `${at}?${new URLSearchParams({ mode }).toString()}`;
}

/** The report a comparison belongs to — where closing one lands. */
export const reportPath = (reportId: string) => `/report/${encodeURIComponent(reportId)}`;

const COMPARISON_PATH = /^\/report\/[^/]+\/compare\/[^/]+$/;

/** Whether a pathname is a comparison's. The report reads its own URL with
 *  this to know a modal is over it, which is what stands its keys down. */
export const isComparisonPath = (pathname: string) => COMPARISON_PATH.test(pathname);
