import {
  THEMES,
  type Theme,
  type Tier,
  VIEWPORTS,
  type ViewportName,
  parseVariantKey,
} from '@gate/visual-diff/policy';
import { SECTIONS, sectionOf, type Section, type SectionKey } from './sections';
import { DEFAULT_SEGMENT, type SetFilter } from './set-filter';
import { storyTitle } from './title';

/**
 * What one screenshot set holds, grouped the way a reader reads it, and what a
 * filter would leave of it: everything about a set that its filenames can say.
 *
 * Its own module, with no filesystem behind it, because the set viewer's
 * template and the shot view are drawn in the browser too — as screen stories —
 * and `set-shots.ts` reads the disk. The grouping is tested from literal
 * filenames for the same reason.
 */

const PNG = '.png';

/** The order the capture matrix is written in, so a row of shots reads
 *  desktop-before-mobile and light-before-dark however `readdir` returned them.
 *  Code-unit comparison everywhere else, never `localeCompare`: the differ's own
 *  determinism rule, and a page that sorted by the host's locale would order one
 *  reviewer's corpus differently from another's. */
const VIEWPORT_ORDER = Object.keys(VIEWPORTS) as readonly ViewportName[];

const rank = <T>(order: readonly T[], value: T) => {
  const at = order.indexOf(value);

  return at === -1 ? order.length : at;
};

/** What a filename alone can say about a shot. */
export type ShotCell = Omit<SetShot, 'bytes' | 'width' | 'height'>;

/** One screenshot in a set: the cell it names, and how big its pixels are. */
export interface SetShot {
  /** The variant key, which is also the filename stem. */
  key: string;
  file: string;
  tier: Tier;
  viewport: ViewportName;
  theme: Theme;
  /** Only on a story listed for the locale axis. */
  locale?: string;
  storyId: string;
  /** Read out of the PNG header, never recorded anywhere — the committed bytes
   *  are what the gate protects. Null for a file whose header would not parse,
   *  which is a shot to show as broken rather than a page to take down. */
  width: number | null;
  height: number | null;
  bytes: number;
}

/** One story, and whichever cells of the matrix it actually has. */
export interface ShotGroup {
  key: string;
  storyId: string;
  title: string;
  tier: Tier;
  shots: readonly SetShot[];
  /** The viewports this story was really captured at. `TIER_VIEWPORTS` is the
   *  rule, but `visual-diff:all-viewports` opts individual stories past it, so
   *  the corpus is the only honest answer to which rows to draw. */
  viewports: readonly ViewportName[];
}

/** One section of the page — a tier, or one app's screens (lib/sections.ts). */
export interface ShotSection {
  section: Section;
  groups: readonly ShotGroup[];
  stories: number;
  shots: number;
}

export interface SetShots {
  label: string;
  isCanonical: boolean;
  sections: readonly ShotSection[];
  shots: number;
  bytes: number;
  /** Files in the directory that name no cell of the matrix. Named rather than
   *  dropped, the way `readSet` logs them: a file whose name is not a variant key
   *  must not read as a story that went missing. `BASELINE_ENV.json` is not one
   *  of them — it is skipped by name, before anything asks — and neither is a
   *  shot's token ledger, which belongs beside it. */
  ignored: readonly string[];
  /** The corpus's host stamp. Null for a capture set, which records none. */
  env: Readonly<Record<string, string>> | null;
}

/** A filename read back as the cell it names, or null for anything that is not
 *  one. The `.png` suffix first, then the key — `parseVariantKey` checks the
 *  three enums and nothing else, which is what lets the six stories tagged past
 *  `TIER_VIEWPORTS` parse like any other. */
export function parseShotName(name: string): ShotCell | null {
  if (!name.endsWith(PNG)) return null;

  const key = name.slice(0, -PNG.length);
  const variant = parseVariantKey(key);
  if (!variant) return null;

  return {
    key,
    file: name,
    tier: variant.tier,
    viewport: variant.viewport,
    theme: variant.theme,
    ...(variant.locale === undefined ? {} : { locale: variant.locale }),
    storyId: variant.id,
  };
}

const byCell = (a: SetShot, b: SetShot) =>
  rank(VIEWPORT_ORDER, a.viewport) - rank(VIEWPORT_ORDER, b.viewport) ||
  rank(THEMES, a.theme) - rank(THEMES, b.theme);

function groupOf(first: SetShot, shots: readonly SetShot[]): ShotGroup {
  const ordered = [...shots].sort(byCell);

  return {
    key: `${first.tier}|${first.storyId}`,
    storyId: first.storyId,
    title: storyTitle(first.storyId),
    tier: first.tier,
    shots: ordered,
    viewports: VIEWPORT_ORDER.filter((viewport) =>
      ordered.some((shot) => shot.viewport === viewport),
    ),
  };
}

/**
 * Shots into sections of stories.
 *
 * One flat map keyed `<tier>|<storyId>`, then a pass over `SECTIONS` — the one
 * `lib/report-view.ts` groups cards with, and the reason a section holding
 * nothing is absent rather than empty.
 */
export function groupShots(shots: readonly SetShot[]): ShotSection[] {
  const byStory = new Map<string, SetShot[]>();
  for (const shot of shots) {
    const key = `${shot.tier}|${shot.storyId}`;
    const bucket = byStory.get(key);
    if (bucket) bucket.push(shot);
    else byStory.set(key, [shot]);
  }

  const groups = [...byStory.values()].flatMap((bucket) => {
    const [first] = bucket;

    return first ? [groupOf(first, bucket)] : [];
  });

  // Each story's section asked once, not once per section it is checked against.
  const bySection = new Map<SectionKey, ShotGroup[]>();
  for (const group of groups) {
    const key = sectionOf(group.tier, group.storyId).key;
    bySection.set(key, [...(bySection.get(key) ?? []), group]);
  }

  return SECTIONS.map((section) => {
    const mine = (bySection.get(section.key) ?? []).sort((a, b) =>
      a.storyId < b.storyId ? -1 : a.storyId > b.storyId ? 1 : 0,
    );

    return {
      section,
      groups: mine,
      stories: mine.length,
      shots: mine.reduce((total, group) => total + group.shots.length, 0),
    };
  }).filter((section) => section.groups.length > 0);
}
/* ---- What a filter would leave ------------------------------------------- */

/** The axes the set viewer counts on. `both` is named rather than implied so a
 *  key always has two parts. `auto` is absent on purpose: it resolves to one of
 *  these at render time, in CSS, so it needs no count of its own. */
export const THEME_CHOICES = ['both', ...THEMES] as const;
export const VIEWPORT_CHOICES = ['both', ...VIEWPORT_ORDER] as const;

/** What each strip DRAWS. `auto` leads, because it is the one choice that reads
 *  the page you are on rather than asking you to describe it. */
export const THEME_SEGMENTS = ['auto', ...THEME_CHOICES] as const;
export const VIEWPORT_SEGMENTS = ['auto', ...VIEWPORT_CHOICES] as const;

export type ThemeChoice = (typeof THEME_CHOICES)[number];
export type ViewportChoice = (typeof VIEWPORT_CHOICES)[number];

/** A strip's segment, as the URL carries it. */
export type ThemeSegment = (typeof THEME_SEGMENTS)[number];
export type ViewportSegment = (typeof VIEWPORT_SEGMENTS)[number];

/** One strip's segment from a query value — the value if the strip draws it,
 *  `both` otherwise, so a hand-edited or stale link degrades to "everything"
 *  rather than to a strip with nothing checked. */
function segmentFrom<T extends string>(segments: readonly T[], raw: unknown): T {
  return segments.find((segment) => segment === raw) ?? (DEFAULT_SEGMENT as T);
}

/** The filter a link asks for, from `?theme=` and `?viewport=`. Takes the
 *  page's own `searchParams` shape, where a repeated key arrives as an array:
 *  that is no filter this page draws, so it reads as the default. */
export function setFilterFrom(
  query: Record<string, string | string[] | undefined>,
): SetFilter {
  return {
    theme: segmentFrom(THEME_SEGMENTS, query.theme),
    viewport: segmentFrom(VIEWPORT_SEGMENTS, query.viewport),
  };
}

/** `${theme}|${viewport}` — the nine cells of the filter matrix. */
export type FilterKey = `${ThemeChoice}|${ViewportChoice}`;

export interface FilterCount {
  shots: number;
  /** Stories with at least one surviving screenshot. A story a filter empties is
   *  hidden rather than drawn empty, so it must not be counted either. */
  stories: number;
}

const keeps = (shot: SetShot, theme: ThemeChoice, viewport: ViewportChoice) =>
  (theme === 'both' || shot.theme === theme) &&
  (viewport === 'both' || shot.viewport === viewport);

/**
 * What each of the nine filter combinations would leave.
 *
 * Precomputed because the page states the count in words and the filtering
 * itself is CSS — `:checked` can hide a cell but it cannot count what is left,
 * so every answer is rendered and the matching one revealed. Nine small numbers
 * is a cheaper price than the client island that would otherwise be needed to
 * say "showing 80 of 160".
 */
export function filterCounts(
  sections: readonly ShotSection[],
): Record<FilterKey, FilterCount> {
  const groups = sections.flatMap((section) => section.groups);
  const counts = {} as Record<FilterKey, FilterCount>;

  for (const theme of THEME_CHOICES) {
    for (const viewport of VIEWPORT_CHOICES) {
      let shots = 0;
      let stories = 0;
      for (const group of groups) {
        const kept = group.shots.filter((shot) => keeps(shot, theme, viewport)).length;
        shots += kept;
        if (kept > 0) stories += 1;
      }
      counts[`${theme}|${viewport}`] = { shots, stories };
    }
  }

  return counts;
}

/**
 * The same nine answers, per section.
 *
 * The bar's count describes the page; a section's heading and its jump link
 * describe a section, and a heading reading "37 stories" over three of them is
 * the page disagreeing with itself. Measured in the browser, which is the only
 * place a CSS filter can be seen at all.
 */
export type SectionCounts = Record<SectionKey, Record<FilterKey, FilterCount>>;

export function sectionFilterCounts(sections: readonly ShotSection[]): SectionCounts {
  return Object.fromEntries(
    sections.map((entry) => [entry.section.key, filterCounts([entry])]),
  ) as SectionCounts;
}

/**
 * Which themes and viewports a tier actually holds.
 *
 * For the jump link that offers it. A tier a filter empties is hidden above,
 * heading and all, so a link still pointing at it is a dead press — and worse
 * than dead, because `:target` matches an element `display: none` never drew, so
 * the "you jumped here" mark lights up on a click that moved nothing.
 *
 * The corpus never reaches that state, and the reason is worth writing down
 * because `TIER_VIEWPORTS` reads like it should: atoms and molecules are
 * desktop-only BY DEFAULT, but `visual-diff:all-viewports` opts individual
 * stories past it, and three atoms and three molecules are opted past — so every
 * tier survives a mobile filter. A partial set is what reaches it: a capture run
 * under a `--filter` can leave a tier holding one viewport, and the console opens
 * a captured set at the same route the corpus uses.
 *
 * Defensive, then, in exactly the way the tier's own rules already are — the
 * `:not(:has([data-shot-theme=…]))` guards cannot fire on the corpus either.
 *
 * Two lists rather than the nine counts above, because a tier's own hide rules
 * are per axis and independent — a link testing the nine combinations instead
 * would disagree with the section it points at about what an empty tier is.
 */
export interface SectionAxes {
  themes: readonly Theme[];
  viewports: readonly ViewportName[];
}

export function sectionAxes(section: ShotSection): SectionAxes {
  const shots = section.groups.flatMap((group) => group.shots);

  return {
    themes: THEMES.filter((theme) => shots.some((shot) => shot.theme === theme)),
    viewports: VIEWPORT_ORDER.filter((viewport) =>
      shots.some((shot) => shot.viewport === viewport),
    ),
  };
}

/**
 * The shots either side of one, in the order the set page draws them: tier,
 * then story, then viewport and theme. Nothing past either end: a walk stops at
 * the last shot rather than wrapping to the first, as the comparison's does.
 */
export function neighbourKeys(
  sections: readonly ShotSection[],
  key: string,
): { prev?: string; next?: string } {
  const order = sections.flatMap((section) =>
    section.groups.flatMap((group) => group.shots.map((shot) => shot.key)),
  );
  const at = order.indexOf(key);
  if (at === -1) return {};
  const prev = order[at - 1];
  const next = order[at + 1];

  return { ...(prev ? { prev } : {}), ...(next ? { next } : {}) };
}
