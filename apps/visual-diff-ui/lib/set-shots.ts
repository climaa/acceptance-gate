import * as fs from 'node:fs';
import * as path from 'node:path';
import { cacheLife, cacheTag } from 'next/cache';
import { pngSize } from '@gate/visual-diff/capture';
import {
  THEMES,
  TIERS,
  type Theme,
  type Tier,
  VIEWPORTS,
  type ViewportName,
  parseVariantKey,
} from '@gate/visual-diff/policy';
import { BASELINE_ENV, CANONICAL_LABEL, setShotsDir } from './baselines';
import { SETS_TAG } from './tags';
import { storyTitle } from './title';

/**
 * What one screenshot set holds, grouped the way a reader reads it.
 *
 * The pure functions are above the cached reader on purpose — the same shape
 * `lib/baselines.ts` keeps, and what lets the grouping be tested from literal
 * filenames with no filesystem behind them.
 *
 * This is NOT `lib/runner.ts`'s `readSet`. That one reads every shot's BYTES,
 * because a comparison needs pixels; a page needs a ratio, which is twenty-four
 * bytes of PNG header. Reading 1.7 MB to learn 160 pairs of integers would be
 * the same work for none of the answer.
 */

const PNG = '.png';

/** Signature, chunk length, `IHDR`, then two big-endian uint32s — everything
 *  `pngSize` reads, and nothing after it. */
const HEADER_BYTES = 24;

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
type ShotCell = Omit<SetShot, 'bytes' | 'width' | 'height'>;

/** What only the file itself can say. */
interface ShotSize {
  bytes: number;
  width: number | null;
  height: number | null;
}

/** One screenshot in a set: the cell it names, and how big its pixels are. */
export interface SetShot {
  /** The variant key, which is also the filename stem. */
  key: string;
  file: string;
  tier: Tier;
  viewport: ViewportName;
  theme: Theme;
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

/** One tier of the design system, as the page draws it. */
export interface ShotSection {
  tier: Tier;
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
   *  of them — it is skipped by name, before anything asks. */
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
 * Shots into tiers of stories.
 *
 * One flat map keyed `<tier>|<storyId>`, then a pass over `TIERS` — the shape
 * `lib/report-view.ts` groups cards with, and the reason a tier holding nothing
 * is absent rather than empty.
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

  return TIERS.map((tier) => {
    const mine = groups
      .filter((group) => group.tier === tier)
      .sort((a, b) => (a.storyId < b.storyId ? -1 : a.storyId > b.storyId ? 1 : 0));

    return {
      tier,
      groups: mine,
      stories: mine.length,
      shots: mine.reduce((total, group) => total + group.shots.length, 0),
    };
  }).filter((section) => section.groups.length > 0);
}

/**
 * A shot's pixel dimensions, or nulls for a file that is there and will not say.
 *
 * A truncated capture, a half-written file, something that is not a regular file
 * at all: the shot still EXISTS, so it is still shown, with the caption stating
 * no size. Reporting it as absent would be the failure `ignored` exists to
 * prevent one level up — a screenshot that is on disk must never read as a story
 * that went missing.
 */
async function headerSize(file: string): Promise<Omit<ShotSize, 'bytes'>> {
  let handle: fs.promises.FileHandle | undefined;

  try {
    handle = await fs.promises.open(file, 'r');
    const header = new Uint8Array(HEADER_BYTES);
    const { bytesRead } = await handle.read(header, 0, HEADER_BYTES, 0);
    const size = bytesRead === HEADER_BYTES ? pngSize(header) : null;

    return { width: size?.width ?? null, height: size?.height ?? null };
  } catch {
    return { width: null, height: null };
  } finally {
    await handle?.close();
  }
}

/**
 * One shot's size on disk and in pixels, or null when there is no file to
 * measure.
 *
 * The two failures are deliberately not the same. `stat` failing means the file
 * went away between the listing and the read, and dropping it is right: there is
 * no screenshot to show. Everything after that is a file that IS there, and is
 * shown — see `headerSize`. Collapsing both into one `catch` is what made an
 * unreadable shot vanish from the page AND from the counts, silently.
 */
async function measure(dir: string, name: string): Promise<ShotSize | null> {
  const file = path.join(dir, name);

  let bytes: number;
  try {
    bytes = (await fs.promises.stat(file)).size;
  } catch {
    return null;
  }

  return { bytes, ...(await headerSize(file)) };
}

/** The corpus's host stamp, or null where there is none to read. A capture set
 *  writes no such file, and a missing file is not an error — see lib/data.ts. */
async function readEnv(dir: string): Promise<Record<string, string> | null> {
  try {
    const raw = await fs.promises.readFile(path.join(dir, BASELINE_ENV), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [
        key,
        String(value),
      ]),
    );
  } catch {
    return null;
  }
}

/**
 * One set's screenshots, or null when there is no such set here.
 *
 * `dataDir` and `root` are both arguments so they join the `use cache` key — the
 * rule every reader in lib/data.ts and lib/baselines.ts keeps. Null covers a
 * label that is not one, a label with no directory, and a corpus with no
 * checkout, and the page tells those apart by asking `readCanonicalSet`, not by
 * asking this.
 */
export async function readSetShots(
  dataDir: string,
  root: string | null,
  label: string,
): Promise<SetShots | null> {
  'use cache';
  cacheLife('seconds');
  cacheTag(SETS_TAG);

  const dir = setShotsDir(dataDir, root, label);
  if (!dir) return null;

  let names: string[];
  try {
    names = await fs.promises.readdir(dir);
  } catch {
    return null;
  }

  const ignored: string[] = [];
  const parsed: ShotCell[] = [];
  for (const name of names) {
    if (name === BASELINE_ENV) continue;

    const cell = parseShotName(name);
    if (cell) parsed.push(cell);
    else ignored.push(name);
  }

  const measured = await Promise.all(parsed.map((cell) => measure(dir, cell.file)));
  const shots: SetShot[] = parsed.flatMap((cell, at) => {
    const size = measured[at];

    return size ? [{ ...cell, ...size }] : [];
  });
  if (shots.length === 0) return null;

  return {
    label,
    isCanonical: label === CANONICAL_LABEL,
    sections: groupShots(shots),
    shots: shots.length,
    bytes: shots.reduce((total, shot) => total + shot.bytes, 0),
    ignored,
    env: await readEnv(dir),
  };
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
 * The same nine answers, per tier.
 *
 * The bar's count describes the page; a tier's heading and its jump link describe
 * a tier, and a heading reading "37 stories" over three of them is the page
 * disagreeing with itself. Measured in the browser, which is the only place a
 * CSS filter can be seen at all.
 */
export type TierCounts = Record<Tier, Record<FilterKey, FilterCount>>;

export function tierFilterCounts(sections: readonly ShotSection[]): TierCounts {
  return Object.fromEntries(
    sections.map((section) => [section.tier, filterCounts([section])]),
  ) as TierCounts;
}
