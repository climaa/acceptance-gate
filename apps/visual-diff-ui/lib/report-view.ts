import { TIER_VIEWPORTS, TIERS, VIEWPORTS } from '@gate/visual-diff/policy';
import type { Bucket, Variant } from './summary';
import { storyTitle } from './title';

/**
 * What the report page shows, derived from `summary.json` and nothing else.
 *
 * Pure and framework-free on purpose: the grouping, the ordering and the
 * filtering are the report's argument — a11y outranks pixels, a story is judged
 * as one card, a filter removes rather than hides — and each of those is a claim
 * a test can make without a browser.
 *
 * `summary.variants` never carries `unchanged` rows: the differ drops them
 * before it writes the file, keeping only their count. Every list below is
 * therefore already "everything worth reviewing", and the `unchanged` chip is a
 * count with nothing behind it — see `EMPTY_UNCHANGED`.
 */

/** The a11y section's accessible name, pinned: it is what "the accessibility
 *  section leads the report" is asserted by. */
export const A11Y_SECTION = 'Accessibility';

/** The chip row's own vocabulary. `total` is not a bucket — it is the row's
 *  "no filter" chip, and it is pressed whenever no bucket is selected. */
export const TOTAL_CHIP = 'total';

export type BucketFilter = Bucket | typeof TOTAL_CHIP;

/**
 * The chip order the board draws, worst-to-quietest, with `total` last.
 * `a11y` moves to the front when it is non-empty — see {@link chipOrder}.
 */
const CHIP_ORDER: readonly BucketFilter[] = [
  'changed',
  'added',
  'removed',
  'errored',
  'a11y',
  'unchanged',
  TOTAL_CHIP,
];

/**
 * The chips, in the order the row renders them.
 *
 * An accessibility failure leads the row when there is one: the first screenful
 * has to answer *is anything inaccessible?* before *did anything move?*, and a
 * chip sitting fifth is a chip a reviewer reads last.
 */
export function chipOrder(a11yCount: number): readonly BucketFilter[] {
  if (a11yCount === 0) return CHIP_ORDER;

  return ['a11y', ...CHIP_ORDER.filter((chip) => chip !== 'a11y')];
}

/** What the reviewer is told when they ask for the one bucket the file does not
 *  carry. Not an error: the count beside it is real, the rows never existed. */
export const EMPTY_UNCHANGED =
  'unchanged variants are counted, never written — the differ keeps their number and drops their rows, so there is nothing here to open.';

/** One story's variants, within one section and one bucket: the unit a reviewer
 *  marks, walks and filters by. */
export interface ReportCard {
  /** Unique within the report — section, bucket and story. */
  key: string;
  storyId: string;
  title: string;
  /** The design-system tier the story belongs to — which is also what decides
   *  the viewports it is captured at. See {@link viewportGaps}. */
  tier: Variant['tier'];
  bucket: Bucket;
  /** The biggest shared-area difference any of this card's variants recorded. */
  worst: number;
  variants: readonly Variant[];
  /**
   * Every viewport this story has a row for *anywhere in the report*, which is
   * not the same as anywhere on this card.
   *
   * A story is split into a card per bucket and per section, so one that changed
   * at desktop and errored at mobile is two cards, and one with an
   * accessibility failure has a row in a section of its own. Each of those cards
   * can see only its own variants — and a card that decided "mobile is missing"
   * from that view would be saying it about evidence sitting a few hundred
   * pixels below it. See {@link viewportGaps}.
   */
  viewportsShown: readonly string[];
}

/** A named `region` of the results: the accessibility section, or one tier. */
export interface ReportSection {
  key: string;
  /** The region's accessible name, and the word its heading leads with. */
  name: string;
  cards: readonly ReportCard[];
  /** Every variant the section holds, flattened — what its progress counts. */
  variantKeys: readonly string[];
}

/** The variants a bucket chip selects. `total`, and no selection at all, are the
 *  same answer: everything the report carries. */
export function filterByBucket(
  variants: readonly Variant[],
  bucket: BucketFilter | null,
): readonly Variant[] {
  if (bucket === null || bucket === TOTAL_CHIP) return variants;

  return variants.filter((variant) => variant.bucket === bucket);
}

/** Which viewports each story has a row for, across the whole report — the
 *  denominator {@link viewportGaps} subtracts from, built once above the split
 *  into sections and buckets that would otherwise hide half of it. */
type ShownViewports = ReadonlyMap<string, ReadonlySet<string>>;

function shownViewports(variants: readonly Variant[]): ShownViewports {
  const shown = new Map<string, Set<string>>();

  for (const variant of variants) {
    const seen = shown.get(variant.id) ?? new Set<string>();
    seen.add(variant.viewport);
    shown.set(variant.id, seen);
  }

  return shown;
}

/** Cards, in the order their first variant appears — which the producer already
 *  sorted worst-first, so the biggest difference in a section leads it. */
function cardsOf(
  sectionKey: string,
  variants: readonly Variant[],
  shown: ShownViewports,
): ReportCard[] {
  const cards = new Map<string, ReportCard & { variants: Variant[] }>();

  for (const variant of variants) {
    const key = `${sectionKey}|${variant.bucket}|${variant.id}`;
    const card = cards.get(key);

    if (card) {
      card.variants.push(variant);
      card.worst = Math.max(card.worst, variant.overlapDiffPixels);
      continue;
    }

    cards.set(key, {
      key,
      storyId: variant.id,
      title: storyTitle(variant.id),
      tier: variant.tier,
      bucket: variant.bucket,
      worst: variant.overlapDiffPixels,
      variants: [variant],
      viewportsShown: [...(shown.get(variant.id) ?? [])],
    });
  }

  return [...cards.values()];
}

function section(
  key: string,
  name: string,
  variants: readonly Variant[],
  shown: ShownViewports,
): ReportSection {
  return {
    key,
    name,
    cards: cardsOf(key, variants, shown),
    variantKeys: variants.map((variant) => variant.key),
  };
}

/**
 * The result sections, in the order `main` renders them.
 *
 * Accessibility first and never folded: an `a11y` variant appears in that
 * section and in no other, whatever its pixels did. The bucket outranks the
 * pixel verdict, so a violation cannot be read as "also changed" and reviewed
 * away with the rest of its tier.
 *
 * The rest follow the design system's own ladder — `TIERS`, innermost first —
 * so a reviewer walks the report the way the library is built. A tier with
 * nothing in it is absent rather than empty.
 */
export function buildSections(
  variants: readonly Variant[],
  /**
   * Every variant the run recorded, before any bucket filter — the denominator
   * {@link viewportGaps} subtracts from, and the one thing here that must not be
   * read off `variants`.
   *
   * The chip row filters before this is called, so a filtered view arrives with
   * rows missing that are still part of the run. Answering "is mobile missing?"
   * from that would let a chip the reviewer pressed turn "you hid this row" into
   * "this shot was never taken". Defaults to `variants` for the unfiltered call.
   */
  corpus: readonly Variant[] = variants,
): ReportSection[] {
  const a11y = variants.filter((variant) => variant.bucket === 'a11y');
  const pixels = variants.filter((variant) => variant.bucket !== 'a11y');

  // Off the whole run, before the split below — a card asked "is mobile
  // missing?" has to answer for the report, not for its own bucket.
  const shown = shownViewports(corpus);

  const tiers = TIERS.map((tier) =>
    section(
      tier,
      tier,
      pixels.filter((variant) => variant.tier === tier),
      shown,
    ),
  );

  return [
    ...(a11y.length > 0 ? [section('a11y', A11Y_SECTION, a11y, shown)] : []),
    ...tiers,
  ].filter((entry) => entry.cards.length > 0);
}

/** Whether a card answers the text filter. Title and story id, because a
 *  reviewer types whichever of the two they have in front of them. */
export function cardMatches(card: ReportCard, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;

  return (
    card.title.toLowerCase().includes(needle) ||
    card.storyId.toLowerCase().includes(needle)
  );
}

/** A card is reviewed when every variant under it is. An empty card cannot be,
 *  which keeps `some`/`all` from both answering true for nothing. */
export function cardReviewed(card: ReportCard, reviewed: ReadonlySet<string>): boolean {
  return (
    card.variants.length > 0 &&
    card.variants.every((variant) => reviewed.has(variant.key))
  );
}

type ViewportName = keyof typeof VIEWPORTS;

const VIEWPORT_NAMES = Object.keys(VIEWPORTS) as readonly ViewportName[];

/** …and one that is shot, whose every variant matched. Same reasoning as
 *  {@link EMPTY_UNCHANGED}: the count is real, the rows never existed. */
const allMatched = (viewport: ViewportName) =>
  `no ${viewport} rows — every ${viewport} variant matched its baseline, and unchanged variants are counted, never written`;

/** A viewport this tier is never shot at. A capture-matrix fact, so it is true
 *  of every card in the tier at once — which is why it is reported by the
 *  section rather than repeated under each card. */
const notCaptured = (viewports: readonly ViewportName[], tier: Variant['tier']) =>
  `no ${viewports.join(' or ')} shot — ${tier} are captured at ${TIER_VIEWPORTS[tier].join(' and ')} only`;

/** The viewports with no row under this card, split by why they have none. */
function absentViewports(card: ReportCard): {
  uncaptured: readonly ViewportName[];
  matched: readonly ViewportName[];
} {
  // An a11y card renders the violation list instead of a viewer, so no frame is
  // missing from it — its finding was never in the pixels. A card with no
  // variants has no tier evidence to reason from; `cardsOf` cannot build one,
  // and `cardReviewed` guards the same shape for the same reason.
  if (card.bucket === 'a11y' || card.variants.length === 0) {
    return { uncaptured: [], matched: [] };
  }

  // Shown anywhere in the report, not merely on this card: a story is split into
  // a card per bucket and per section, so one that changed at desktop and
  // errored at mobile is two cards — and reading only this card's variants, each
  // would call the other's viewport missing while its row sits further down.
  const shown = new Set<string>(card.viewportsShown);
  const matrix: readonly string[] = TIER_VIEWPORTS[card.tier];
  const absent = VIEWPORT_NAMES.filter((viewport) => !shown.has(viewport));

  return {
    uncaptured: absent.filter((viewport) => !matrix.includes(viewport)),
    matched: absent.filter((viewport) => matrix.includes(viewport)),
  };
}

/**
 * Why a viewport has no rows under this card — the card-scoped half.
 *
 * A card showing only `desktop/*` is two very different reports depending on its
 * tier. `TIER_VIEWPORTS` captures atoms and molecules at desktop only, so an
 * atoms card *cannot* have a mobile row and no shot was ever taken; a templates
 * card with the same rows was shot at mobile and matched. Saying "unchanged" for
 * the first, or "not captured" for the second, would both be false.
 *
 * Only the second is answered here, because only the second varies per card.
 * The first is a fact about the tier and belongs to
 * {@link sectionViewportNote} — said once for the section instead of verbatim
 * under every card in it.
 *
 * Reported per viewport, never per cell: a viewport with any row visible is not
 * missing, which holds this to at most one sentence per viewport rather than one
 * per variant that happened to match.
 *
 * The one case it cannot see: a story tagged `visual-diff:all-viewports` whose
 * every extra-viewport variant matched. `summary.json` records no story tags, so
 * that card is indistinguishable from an untagged one — it is read as its tier.
 */
export function viewportGaps(card: ReportCard): readonly string[] {
  return absentViewports(card).matched.map(allMatched);
}

/**
 * The tier-scoped half: a viewport the whole section was never captured at.
 *
 * "atoms are captured at desktop only" is true of every card in the atoms
 * section identically, so a report with twenty changed atoms rendered it twenty
 * times — read once and heard twenty times by anyone walking the page with a
 * screen reader. The section says it, once, above the cards it applies to.
 *
 * Still derived from the cards rather than from the tier alone: a story tagged
 * `visual-diff:all-viewports` does have rows its tier never promises, and a
 * section made only of those has nothing missing to explain.
 */
export function sectionViewportNote(section: ReportSection): string | undefined {
  const uncaptured = [
    ...new Set(section.cards.flatMap((card) => absentViewports(card).uncaptured)),
  ];
  const [tier] = section.cards.map((card) => card.tier);
  if (uncaptured.length === 0 || tier === undefined) return undefined;

  return notCaptured(uncaptured, tier);
}

/** How many of `keys` are marked. The denominator lives elsewhere: a section
 *  counts its own variants, the bar counts the whole report's. */
export function countReviewed(
  keys: readonly string[],
  reviewed: ReadonlySet<string>,
): number {
  return keys.filter((key) => reviewed.has(key)).length;
}

/** The DOM id a card carries, so the keyboard walk can focus one without the
 *  list it is walking having to hold element references. */
export const cardElementId = (cardKey: string) =>
  `vd-card-${cardKey.replace(/[^A-Za-z0-9_-]/g, '-')}`;

/** Figures a reviewer reads as quantities, grouped the way the board draws
 *  them. `en-US` explicitly: the grouping must not depend on the host's locale,
 *  the same determinism rule the differ's own ordering follows. */
export const formatPixels = (pixels: number) => pixels.toLocaleString('en-US');

/** The published Storybook — the one a reviewer can open from a phone, and the
 *  one the baselines were built from. */
export const PUBLISHED_STORYBOOK = 'https://acceptance-gate-storybook.vercel.app';

/** The Storybook a developer has running beside the console. */
export const DEV_STORYBOOK = 'http://localhost:6006';

/**
 * Whether to offer the link to {@link DEV_STORYBOOK}.
 *
 * It names `localhost:6006`, which exists only while someone is running the
 * design system beside this console — on the deployed report it is a link to
 * nothing, and a dead link beside a live one is worse than no link. The mode is
 * an argument rather than a read at module scope so both answers are reachable
 * from a test without stubbing the module.
 */
export const showsDevStorybook = (mode = process.env.NODE_ENV) => mode === 'development';

/**
 * A deep link to one story, in one theme.
 *
 * The manager, not `iframe.html`: the bare preview document renders the story
 * with no sidebar, no toolbar and no way to reach the one beside it, and a
 * reviewer following this link has come to look around.
 *
 * `/index.html` explicitly, never the bare origin. The published Storybook
 * redirects `/` to the Welcome page (`apps/storybook/vercel.json`), and Vercel
 * resolves that redirect by taking the destination's own query and appending
 * the request's — so `/?path=/story/x` arrives as
 * `path=/docs/docs-welcome--docs`, with the story silently replaced by the front
 * door and the `colorScheme` colon percent-encoded on the way. Both halves of
 * that are the failure below. `/index.html` matches no redirect and is served
 * by the dev server too, so one shape works against both Storybooks.
 *
 * The `colorScheme:` colon stays literal. Percent-encoding it produces a URL
 * Storybook accepts and silently ignores, which renders every dark link light —
 * the exact failure mode `COLOR_SCHEME_GLOBAL` exists to prevent one layer down.
 * The id is encoded; the globals expression is not.
 */
export function storybookLink(base: string, storyId: string, theme: string): string {
  return `${base}/index.html?path=/story/${encodeURIComponent(storyId)}&globals=colorScheme:${theme}`;
}

/** axe's own rule documentation, keyed by rule id. The version is the one
 *  `@axe-core/playwright` is pinned to in packages/visual-diff — Deque scopes
 *  these pages per release, and an unversioned guess 404s. */
const AXE_DOCS_VERSION = '4.12';

export const ruleDocsLink = (ruleId: string) =>
  `https://dequeuniversity.com/rules/axe/${AXE_DOCS_VERSION}/${encodeURIComponent(ruleId)}`;

/** The two capture sets a report compares, as its id names them. */
export interface ReportSides {
  a: string;
  b: string;
}

/**
 * A report id is `<setA>__<setB>` — the only place the two sides are recorded,
 * since `summary.json` names neither. An id that does not split is a report
 * written by something other than this app's runner; it still renders, with the
 * two sides called what the comparison calls them.
 */
export function reportSides(id: string): ReportSides {
  const separator = id.indexOf('__');
  if (separator === -1) return { a: 'baseline', b: 'candidate' };

  return { a: id.slice(0, separator), b: id.slice(separator + '__'.length) };
}
