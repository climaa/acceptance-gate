import type { Variant } from './summary';
import { storyTitle } from './title';

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
 * them. x-visual-diff-pages draws exactly this row.
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
  view: ComparisonView = {},
): string {
  const params = new URLSearchParams();
  if (mode !== null && mode !== DEFAULT_MODE) params.set('mode', mode);
  if (view.against === 'design') {
    params.set('against', 'design');
    if (view.board) params.set('board', view.board);
  }

  const query = params.toString();
  const at = comparisonPath(reportId, key);

  return query === '' ? at : `${at}?${query}`;
}

/** The report a comparison belongs to — where closing one lands. */
export const reportPath = (reportId: string) => `/report/${encodeURIComponent(reportId)}`;

const COMPARISON_PATH = /^\/report\/([^/]+)\/compare\/([^/]+)$/;

/**
 * A comparison's pathname, split back into its report and its key — the one
 * reading of `comparisonPath`'s output. The proxy, the modal and the report all
 * ask this, so none of them can come to disagree about what a comparison is.
 *
 * Null for a pathname that is not one, and for one whose segments will not
 * decode: `decodeURIComponent('%')` throws, and every caller would rather say
 * "not a comparison" than fail. Each segment is decoded on its own, after the
 * split, so an encoded slash inside either cannot move it.
 */
export function parseComparisonPath(
  pathname: string,
): { reportId: string; key: string } | null {
  const match = COMPARISON_PATH.exec(pathname);
  if (!match?.[1] || !match[2]) return null;

  try {
    return { reportId: decodeURIComponent(match[1]), key: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

/** Whether a pathname is a comparison's. The report reads its own URL with
 *  this to know a modal is over it, which is what stands its keys down. */
export const isComparisonPath = (pathname: string) =>
  parseComparisonPath(pathname) !== null;

/**
 * The sentence a comparison is known by: the modal's heading, its `<title>` and
 * its card's headline. One function, so a walk that retitles the tab and a link
 * preview that names it can never disagree with the dialog on screen.
 */
export const comparisonTitle = (variant: Pick<Variant, 'id' | 'viewport' | 'theme'>) =>
  `${storyTitle(variant.id)} · ${variant.viewport}/${variant.theme}`;

/**
 * What a comparison is read against, beside its mode. `board` is the one the
 * reviewer picked, and null for "whichever this variant opens on" — so a link
 * carries a board only when someone chose one.
 */
export interface ComparisonView {
  against?: Against;
  board?: DesignBoard | null;
}

/**
 * What the comparison is read against: its own _before_, or a design board.
 *
 * Kept apart from {@link COMPARISON_MODES} on purpose. Every mode answers "how
 * does after differ from before"; a design board answers a different question
 * — "is this what was drawn" — and has no shared pixel grid with a screenshot,
 * so no mode could be run against it honestly.
 */
export const AGAINST = ['before', 'design'] as const;

export type Against = (typeof AGAINST)[number];

export const DEFAULT_AGAINST: Against = 'before';

export const isAgainst = (value: string | null): value is Against =>
  AGAINST.some((against) => against === value);

/**
 * The design boards a comparison can be read against: the PNGs exported from
 * each board's `designs/<stem>.pen` into `designs/exports/`, by file stem
 * (designs/STANDARD.md). The tier boards first, in tier order, then the
 * reference boards. The allowlist IS the route's confinement — a name not here
 * is never turned into a path.
 */
export const DESIGN_BOARDS = [
  '01-atoms',
  '02-molecules',
  '03-organisms',
  '04-templates',
  '05-screens',
  '05-pages',
  'x-visual-diff-pages',
  '06-flows-decisions',
] as const;

export type DesignBoard = (typeof DESIGN_BOARDS)[number];

export const isDesignBoard = (value: string | null): value is DesignBoard =>
  DESIGN_BOARDS.some((board) => board === value);

/** The tier board each tier's tiles are drawn on. A board that outgrows one export
 *  pages as `<stem>-1`, `<stem>-2`, … (designs/STANDARD.md) and is still that board. */
const TIER_STEMS: Readonly<Record<Variant['tier'], string>> = {
  atoms: '01-atoms',
  molecules: '02-molecules',
  organisms: '03-organisms',
  templates: '04-templates',
  screens: '05-screens',
};

/** A tier's board, or its pages in order when it is paged. */
export const tierBoards = (tier: Variant['tier']): DesignBoard[] => {
  const own = new RegExp(`^${TIER_STEMS[tier]}(-\\d+)?$`);

  return DESIGN_BOARDS.filter((board) => own.test(board));
};

/**
 * The board each variant's tile is drawn on, by variant key: read off the tier
 * boards' tile maps on the server (lib/board-homes.ts). On an unpaged tier it
 * only confirms what the tier already says; on a paged one it is the only way to
 * know which page holds the tile.
 */
export type BoardHomes = Readonly<Partial<Record<string, DesignBoard>>>;

/** The board a variant opens on: the one that draws its tile, else its tier's
 *  first. The reviewer can always pick another. */
export const defaultBoard = (
  variant: { tier: Variant['tier']; key: string },
  homes: BoardHomes,
): DesignBoard => homes[variant.key] ?? tierBoards(variant.tier)[0] ?? DESIGN_BOARDS[0];
