// @ts-check
//
// `storybook-static/index.json` → the list of variants the capture loop shoots. Pure:
// no filesystem, no browser, no import outside `./policy.mjs`, so the whole enumeration
// is unit-testable against a fixture string.
//
// Every rule here fails loudly. A differ that quietly captures fewer stories than the
// build contains reports a green gate over an unexamined UI, which is worse than no
// gate at all — so a malformed index, a story outside the tier folders and a build with
// no stories in it all throw instead of shrinking the plan.

import {
  ALL_VIEWPORTS_TAG,
  FULLPAGE_TAG,
  LOCALES,
  LOCALES_TAG,
  MOBILE_ONLY_TAG,
  MODES,
  SKIP_TAG,
  TIERS,
  VIEWPORTS,
  tierOf,
  variantKey,
} from './policy.mjs';

/** @typedef {import('./policy.mjs').Tier} Tier */
/** @typedef {import('./policy.mjs').ViewportName} ViewportName */
/** @typedef {import('./policy.mjs').Theme} Theme */
/** @typedef {import('./policy.mjs').Mode} Mode */

/** An entry of `index.json`, narrowed to the fields the differ reads, and the
 *  Storybook build it was read from when the caller named one.
 *  @typedef {{ id: string, title: string, type: string, importPath: string,
 *              tags: readonly string[], root?: string }} IndexEntry */

/** One cell of the capture matrix for one story: everything `capture.mjs` needs to
 *  take the shot and name the file it writes. `locale` only on a {@link LOCALES_TAG}
 *  story; `root` is the build that serves it, when its entry named one.
 *  @typedef {{ id: string, tier: Tier, viewport: ViewportName, theme: Theme,
 *              locale?: string, fullPage: boolean, key: string,
 *              root?: string }} PlannedVariant */

/** The gate is broken: the corpus could not be enumerated at all. Its own class because
 *  the CLI answers it differently from a diff — a diff means the UI changed and the
 *  report is worth reading; this means the run never had a corpus, and no verdict from
 *  it means anything. */
export class IndexError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'IndexError';
  }
}

const VIEWPORT_NAMES = /** @type {readonly ViewportName[]} */ (Object.keys(VIEWPORTS));

/** @param {unknown} value */
const isRecord = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** @param {unknown} value */
const isFilledString = (value) => typeof value === 'string' && value.length > 0;

/** @param {IndexEntry} entry */
const isSkipped = (entry) => entry.tags.includes(SKIP_TAG);

/** @param {unknown} entry @param {string} key the entry's key in `entries` */
function readEntry(entry, key) {
  if (!isRecord(entry)) throw new IndexError(`index entry ${key} is not an object`);

  const {
    id,
    title,
    type,
    importPath,
    tags = [],
  } = /** @type {Record<string, unknown>} */ (entry);
  const strings = { id, title, type, importPath };
  for (const [field, value] of Object.entries(strings)) {
    if (!isFilledString(value)) {
      throw new IndexError(`index entry ${key} has no ${field}`);
    }
  }
  if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === 'string')) {
    throw new IndexError(`index entry ${key} has tags that are not strings`);
  }

  return /** @type {IndexEntry} */ ({ ...strings, tags });
}

/** Parse and shape-validate the *text* of `storybook-static/index.json`.
 *
 *  Entries come back as written, docs included: which types are captured is policy the
 *  caller applies, not something the parser decides. `root`, when given, is the build
 *  the text was read from, carried on every entry so its variants are shot against it.
 *  `allowEmpty` reads a build with no entries as none rather than refusing it: for a
 *  build after the first, whose package may have no story yet. The first build is
 *  never read so, and the plan still refuses a run with no story at all.
 *  @param {unknown} json the file's contents
 *  @param {string} [root]
 *  @param {{ allowEmpty?: boolean }} [options]
 *  @returns {IndexEntry[]}
 *  @throws {IndexError} on anything that is not a Storybook index, or an empty one */
export function readIndex(json, root, { allowEmpty = false } = {}) {
  if (typeof json !== 'string') {
    throw new IndexError('index.json was not read as text');
  }

  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (cause) {
    throw new IndexError(
      `index.json is not JSON: ${/** @type {Error} */ (cause).message}`,
    );
  }

  const entries = isRecord(parsed) ? parsed.entries : undefined;
  if (!isRecord(entries)) {
    throw new IndexError('index.json has no `entries` object');
  }

  const keys = Object.keys(entries);
  if (keys.length === 0 && allowEmpty) return [];
  if (keys.length === 0) {
    throw new IndexError('index.json lists no entries — the Storybook build is empty');
  }

  const read = keys.map((key) => readEntry(entries[key], key));
  return root === undefined ? read : read.map((entry) => ({ ...entry, root }));
}

/** The viewports a story's tags put it at instead of its tier's, or null for the
 *  tier's own. Both overrides at once contradict each other, and picking one would
 *  drop a baseline a reader asked for.
 *  @param {IndexEntry} entry @returns {readonly ViewportName[] | null} */
function viewportOverride(entry) {
  const all = entry.tags.includes(ALL_VIEWPORTS_TAG);
  const mobileOnly = entry.tags.includes(MOBILE_ONLY_TAG);
  if (all && mobileOnly) {
    throw new IndexError(
      `story ${entry.id} carries both ${ALL_VIEWPORTS_TAG} and ${MOBILE_ONLY_TAG}`,
    );
  }
  if (all) return VIEWPORT_NAMES;

  return mobileOnly ? ['mobile'] : null;
}

/** The matrix cells one story is captured in. `MODES` is the default — `TIER_VIEWPORTS`
 *  is already folded into it — and a viewport override replaces the viewport axis
 *  alone: {@link ALL_VIEWPORTS_TAG} widens it, so a molecule with a container query is
 *  captured at both widths without its whole tier being promoted, and
 *  {@link MOBILE_ONLY_TAG} narrows it to the phone, so a native component is never
 *  shot at desktop. Neither gives a story a theme it does not have.
 *  @param {Tier} tier @param {readonly ViewportName[] | null} viewports
 *  @returns {Mode[]} */
function modesFor(tier, viewports) {
  const tierModes = MODES.filter((mode) => mode.tier === tier);
  if (viewports === null) return tierModes;

  const themes = [...new Set(tierModes.map((mode) => mode.theme))];
  return viewports.flatMap((viewport) =>
    themes.map((theme) => ({ tier, viewport, theme })),
  );
}

/** The modes again, once per locale for a {@link LOCALES_TAG} story — and untouched
 *  otherwise, so an unlisted story's cells carry no `locale` field at all.
 *  @param {Mode[]} modes @param {boolean} listed
 *  @returns {(Mode & { locale?: string })[]} */
function localesFor(modes, listed) {
  if (!listed) return modes;

  return modes.flatMap((mode) => LOCALES.map((locale) => ({ ...mode, locale })));
}

/** @param {IndexEntry} entry @returns {PlannedVariant[]} */
function variantsOf(entry) {
  const tier = tierOf(entry.importPath);
  if (tier === null) {
    // The boundaries lint should have caught this upstream. Assigning the story to a
    // tier anyway would give it a baseline filename that claims a layer it is not in,
    // and the first reader to trust that name is misled by it.
    throw new IndexError(
      `story ${entry.id} sits outside packages/{ui,ui-native}/src/{${TIERS.join(',')}}: ${entry.importPath}`,
    );
  }

  const fullPage = entry.tags.includes(FULLPAGE_TAG);
  const modes = modesFor(tier, viewportOverride(entry));
  const root = entry.root === undefined ? {} : { root: entry.root };
  return localesFor(modes, entry.tags.includes(LOCALES_TAG)).map((mode) => ({
    ...mode,
    id: entry.id,
    fullPage,
    key: variantKey({ ...mode, id: entry.id }),
    ...root,
  }));
}

/** Every story id that two builds both claim. Storybook keeps ids unique inside one
 *  build, never across two, and two stories under one id would write one baseline.
 *  @param {readonly IndexEntry[]} stories @returns {string[]} */
function sharedIds(stories) {
  const rootsById = new Map();
  for (const { id, root } of stories) {
    rootsById.set(id, new Set([...(rootsById.get(id) ?? []), root]));
  }

  return [...rootsById].filter(([, roots]) => roots.size > 1).map(([id]) => id);
}

/** The capture plan for a whole index: every variant to shoot, plus the stories held
 *  back by {@link SKIP_TAG} so the report can list them instead of leaving a hole no
 *  reader can see. The skip *reason* is not here — it lives on the story, where the
 *  Wave 2 lint rule requires it.
 *  @param {readonly IndexEntry[]} entries
 *  @returns {{ variants: PlannedVariant[], skipped: string[] }}
 *  @throws {IndexError} if the build contains no stories, one the matrix cannot place,
 *    or one id two builds both list */
export function planCaptures(entries) {
  const stories = entries.filter((entry) => entry.type === 'story');
  if (stories.length === 0) {
    throw new IndexError('index.json lists no stories — only docs pages were built');
  }
  const shared = sharedIds(stories);
  if (shared.length > 0) {
    throw new IndexError(
      `more than one Storybook build lists ${shared.join(', ')}; a story id names one story`,
    );
  }

  return {
    variants: stories.filter((entry) => !isSkipped(entry)).flatMap(variantsOf),
    skipped: stories.filter(isSkipped).map((entry) => entry.id),
  };
}
