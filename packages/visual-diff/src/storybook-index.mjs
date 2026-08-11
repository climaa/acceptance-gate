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

/** An entry of `index.json`, narrowed to the fields the differ reads.
 *  @typedef {{ id: string, title: string, type: string, importPath: string,
 *              tags: readonly string[] }} IndexEntry */

/** One cell of the capture matrix for one story: everything `capture.mjs` needs to
 *  take the shot and name the file it writes.
 *  @typedef {{ id: string, tier: Tier, viewport: ViewportName, theme: Theme,
 *              fullPage: boolean, key: string }} PlannedVariant */

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
 *  caller applies, not something the parser decides.
 *  @param {unknown} json the file's contents
 *  @returns {IndexEntry[]}
 *  @throws {IndexError} on anything that is not a populated Storybook index */
export function readIndex(json) {
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
  if (keys.length === 0) {
    throw new IndexError('index.json lists no entries — the Storybook build is empty');
  }

  return keys.map((key) => readEntry(entries[key], key));
}

/** The matrix cells one story is captured in. `MODES` is the default — `TIER_VIEWPORTS`
 *  is already folded into it — and {@link ALL_VIEWPORTS_TAG} widens the viewport axis
 *  alone, so a molecule with a container query is captured at both widths without its
 *  whole tier being promoted and without gaining a theme it does not have.
 *  @param {Tier} tier @param {boolean} allViewports @returns {Mode[]} */
function modesFor(tier, allViewports) {
  const tierModes = MODES.filter((mode) => mode.tier === tier);
  if (!allViewports) return tierModes;

  const themes = [...new Set(tierModes.map((mode) => mode.theme))];
  return VIEWPORT_NAMES.flatMap((viewport) =>
    themes.map((theme) => ({ tier, viewport, theme })),
  );
}

/** @param {IndexEntry} entry @returns {PlannedVariant[]} */
function variantsOf(entry) {
  const tier = tierOf(entry.importPath);
  if (tier === null) {
    // The boundaries lint should have caught this upstream. Assigning the story to a
    // tier anyway would give it a baseline filename that claims a layer it is not in,
    // and the first reader to trust that name is misled by it.
    throw new IndexError(
      `story ${entry.id} sits outside packages/ui/src/{${TIERS.join(',')}}: ${entry.importPath}`,
    );
  }

  const fullPage = entry.tags.includes(FULLPAGE_TAG);
  return modesFor(tier, entry.tags.includes(ALL_VIEWPORTS_TAG)).map((mode) => ({
    ...mode,
    id: entry.id,
    fullPage,
    key: variantKey({ ...mode, id: entry.id }),
  }));
}

/** The capture plan for a whole index: every variant to shoot, plus the stories held
 *  back by {@link SKIP_TAG} so the report can list them instead of leaving a hole no
 *  reader can see. The skip *reason* is not here — it lives on the story, where the
 *  Wave 2 lint rule requires it.
 *  @param {readonly IndexEntry[]} entries
 *  @returns {{ variants: PlannedVariant[], skipped: string[] }}
 *  @throws {IndexError} if the build contains no stories, or one the matrix cannot place */
export function planCaptures(entries) {
  const stories = entries.filter((entry) => entry.type === 'story');
  if (stories.length === 0) {
    throw new IndexError('index.json lists no stories — only docs pages were built');
  }

  return {
    variants: stories.filter((entry) => !isSkipped(entry)).flatMap(variantsOf),
    skipped: stories.filter(isSkipped).map((entry) => entry.id),
  };
}
