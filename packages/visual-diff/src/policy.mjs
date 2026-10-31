// @ts-check
//
// The one place every visual-diff literal is written. It is imported by
// `packages/ui/eslint.config.mjs`, by Storybook's `preview.tsx` and by the capture
// CLI, so it stays zero-import and side-effect free: `preview.tsx` loads it through
// Vite, and `capture.mjs` is the only module allowed a `playwright` import.

/** @typedef {'atoms' | 'molecules' | 'organisms' | 'templates' | 'screens'} Tier */
/** @typedef {'light' | 'dark'} Theme */
/** @typedef {'desktop' | 'mobile'} ViewportName */
/** @typedef {{ tier: Tier, viewport: ViewportName, theme: Theme }} Mode */
/** `locale` is present only on a story listed with {@link LOCALES_TAG}; every other
 *  variant has no such field, which is what keeps its key the one it always had.
 *  @typedef {Mode & { locale?: string, id: string }} Variant */

/** Atomic-design tiers, innermost first. Import order matters: the layering rule
 *  allows a tier to import only from tiers earlier in this array.
 *
 *  `screens` is last and is not a folder of `packages/ui`: it is a whole page of an
 *  app in {@link APP_ROOTS}, baselined like a template at both viewports.
 *  @type {readonly Tier[]} */
export const TIERS = ['atoms', 'molecules', 'organisms', 'templates', 'screens'];

/** The tiers that are folders of `packages/ui/src/` — every tier but `screens`.
 *  @type {readonly Tier[]} */
export const UI_TIERS = TIERS.filter((tier) => tier !== 'screens');

/** Theme values. Selected via `data-theme` on <html> — never prefers-color-scheme.
 *  @type {readonly Theme[]} */
export const THEMES = ['light', 'dark'];

/** Capture viewports, in CSS pixels at deviceScaleFactor 1.
 *  @type {Readonly<Record<ViewportName, { width: number, height: number }>>} */
export const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
};

/** Tier → the viewports that tier is captured at.
 *  Atoms and molecules do not change shape between viewports, so capturing them
 *  at mobile would double the baseline count and catch nothing.
 *  @type {Readonly<Record<Tier, readonly ViewportName[]>>} */
export const TIER_VIEWPORTS = {
  atoms: ['desktop'],
  molecules: ['desktop'],
  organisms: ['desktop', 'mobile'],
  templates: ['desktop', 'mobile'],
  screens: ['desktop', 'mobile'],
};

/** The full capture matrix: one entry per (tier, viewport, theme) cell.
 *  @type {readonly Mode[]} */
export const MODES = TIERS.flatMap((tier) =>
  TIER_VIEWPORTS[tier].flatMap((viewport) =>
    THEMES.map((theme) => ({ tier, viewport, theme })),
  ),
);

/** Applied to a story that cannot be captured deterministically. Requires a reason;
 *  the report lists skipped stories rather than hiding them. */
export const SKIP_TAG = 'visual-diff:skip';

/** Applied to a story shot whole-page instead of at {@link CAPTURE_TARGET} — a
 *  template whose fixed header only exists relative to the viewport, say. */
export const FULLPAGE_TAG = 'visual-diff:fullpage';

/** Per-story override of {@link TIER_VIEWPORTS}: capture at every viewport in
 *  {@link VIEWPORTS} whatever the tier says. For the component that does reflow with
 *  width — a molecule carrying a container query — without promoting its whole tier. */
export const ALL_VIEWPORTS_TAG = 'visual-diff:all-viewports';

/** Per-story override of {@link TIER_VIEWPORTS} the other way: capture at the mobile
 *  viewport alone, whatever the tier says. For a component that only exists on a
 *  phone — a React Native one rendered through react-native-web — whose desktop shot
 *  would be a phone layout stretched to 1280 px, a baseline of something no user
 *  sees. A story carrying both this and {@link ALL_VIEWPORTS_TAG} is refused. */
export const MOBILE_ONLY_TAG = 'visual-diff:mobile-only';

/** Per-story opt-in to the locale axis: capture once per entry in {@link LOCALES},
 *  in every theme and viewport the story already has. Only listed stories get the
 *  axis, because a story whose text never changes with the language would double its
 *  baselines and catch nothing — the same argument {@link TIER_VIEWPORTS} makes for
 *  viewports. */
export const LOCALES_TAG = 'visual-diff:locales';

/** The locales a {@link LOCALES_TAG} story is captured in, as the language subtags
 *  the Storybook {@link LOCALE_GLOBAL} takes. This repository ships English only, so
 *  the axis is declared and inert here: no story is listed, and a child with
 *  translated UI lists its own locales (torn: `en`, `es`). Lowercase letters only, so
 *  a key still splits back into its fields on {@link KEY_SEPARATOR}.
 *  @type {readonly string[]} */
export const LOCALES = ['en'];

/** Storybook's story root: the element every non-fullpage shot is taken of. */
export const CAPTURE_TARGET = '#storybook-root';

/** The Storybook *global* driving the theme, named once for both consumers.
 *  A global rather than a parameter because only a global can be set from the capture
 *  URL. The name has to be identical on both sides: name it `theme` in the toolbar and
 *  `colorScheme` in the URL and every dark capture silently renders light, which lands
 *  as byte-identical dark baselines that look exactly like a passing gate. */
export const COLOR_SCHEME_GLOBAL = 'colorScheme';

/** The Storybook *global* carrying a listed story's locale, for the same reason the
 *  theme is one: only a global can be set from the capture URL. Absent from an
 *  unlisted story's URL entirely, so its page renders exactly as it did before the
 *  locale axis existed. */
export const LOCALE_GLOBAL = 'locale';

/** The component packages whose `src/<tier>/` folders hold tiered stories: the web
 *  one, and the React Native one a child with a native app keeps beside it, whose
 *  stories its own Storybook renders through react-native-web. A repository without
 *  `packages/ui-native` simply has no story there.
 *  @type {readonly (readonly string[])[]} */
const UI_SRCS = [
  ['packages', 'ui', 'src'],
  ['packages', 'ui-native', 'src'],
];

/** The app directories whose stories are `screens`, named one by one rather than
 *  matched as every app's `app/`. Here the one listed is the console itself, the
 *  reverse of every child project's list: in this repository the console is the
 *  product, so its pages are photographed on purpose. A child keeps
 *  `apps/visual-diff-ui` out, because there it is the tool, not the thing shot.
 *  @type {readonly (readonly string[])[]} */
export const APP_ROOTS = [['apps', 'visual-diff-ui', 'app']];

/** Where Storybook runs, and so what a `./` or `../` `importPath` is relative to:
 *  `../visual-diff-ui/app/…` is `apps/visual-diff-ui/app/…` read from here. */
const STORYBOOK_DIR = ['apps', 'storybook'];

/** @param {readonly string[]} segments @param {readonly string[]} run
 *  @param {number} index */
const runStartsAt = (segments, run, index) =>
  run.every((segment, offset) => segments[index + offset] === segment);

/** @param {readonly string[]} segments @param {readonly string[]} run */
const indexOfRun = (segments, run) =>
  segments.findIndex((_, index) => runStartsAt(segments, run, index));

/** A story path as repo-root segments. A relative `importPath` is resolved against
 *  {@link STORYBOOK_DIR}; anything else is read as it is written.
 *  @param {string} storyPath @returns {string[]} */
function segmentsOf(storyPath) {
  const written = storyPath.replaceAll('\\', '/').split('/');
  if (written[0] !== '.' && written[0] !== '..') return written;

  return [...STORYBOOK_DIR, ...written].reduce((resolved, segment) => {
    if (segment === '..') resolved.pop();
    else if (segment !== '.') resolved.push(segment);
    return resolved;
  }, /** @type {string[]} */ ([]));
}

/** The tier a story belongs to, derived from its `importPath`. A story under
 *  `packages/ui/src/<tier>/` is in that tier, and one under an {@link APP_ROOTS}
 *  directory is a `screens` story. Anything else — the barrels, a path in another
 *  workspace — is `null` rather than a guess: a story the matrix cannot place is
 *  reported, never captured under a tier it does not have.
 *  @param {string} storyPath
 *  @returns {Tier | null} */
export function tierOf(storyPath) {
  const segments = segmentsOf(storyPath);
  if (APP_ROOTS.some((root) => indexOfRun(segments, root) !== -1)) return 'screens';

  for (const src of UI_SRCS) {
    const start = indexOfRun(segments, src);
    if (start === -1) continue;

    const candidate = segments[start + src.length];
    return UI_TIERS.find((tier) => tier === candidate) ?? null;
  }

  return null;
}

/** Storybook ids are `[a-z0-9-]` only, so a doubled underscore cannot occur inside
 *  one and a key splits back into its fields unambiguously. */
const KEY_SEPARATOR = '__';

const VIEWPORT_NAMES = /** @type {readonly ViewportName[]} */ (Object.keys(VIEWPORTS));

/** The baseline filename contract — one key per captured variant, `.png` appended by
 *  the writer. `parseVariantKey(variantKey(v))` deep-equals `v`.
 *
 *  `tier__viewport__theme__id`, and `tier__viewport__theme__locale__id` for a story
 *  listed with {@link LOCALES_TAG}. The locale sits with the other matrix fields and
 *  the story id stays last, so a reader that takes the last field as the id is right
 *  for both shapes.
 *  @param {Variant} variant
 *  @returns {string} */
export function variantKey({ tier, viewport, theme, locale, id }) {
  const cell =
    locale === undefined ? [tier, viewport, theme] : [tier, viewport, theme, locale];

  return [...cell, id].join(KEY_SEPARATOR);
}

/** The inverse of {@link variantKey}. `null` for a key naming a cell outside the
 *  matrix, so a baseline left behind by a retired tier or theme is reported as an
 *  orphan instead of being read back as a variant nothing captures.
 *  @param {string} key
 *  @returns {Variant | null} */
export function parseVariantKey(key) {
  const fields = key.split(KEY_SEPARATOR);
  // A story id never holds the separator, so five fields can only be a listed story's.
  if (fields.length === 5) return parseLocaleKey(fields);
  if (fields.length !== 4) return null;

  const [tier, viewport, theme, id] = fields;
  return parseCell(tier, viewport, theme, id);
}

/** @param {readonly string[]} fields @returns {Variant | null} */
function parseLocaleKey([tier, viewport, theme, locale, id]) {
  const cell = parseCell(tier, viewport, theme, id);
  if (cell === null || !LOCALES.includes(locale ?? '')) return null;

  return {
    tier: cell.tier,
    viewport: cell.viewport,
    theme: cell.theme,
    locale,
    id: cell.id,
  };
}

/** @param {string | undefined} tier @param {string | undefined} viewport
 *  @param {string | undefined} theme @param {string | undefined} id
 *  @returns {Variant | null} */
function parseCell(tier, viewport, theme, id) {
  if (!id) return null;

  const knownTier = TIERS.find((candidate) => candidate === tier);
  const knownViewport = VIEWPORT_NAMES.find((candidate) => candidate === viewport);
  const knownTheme = THEMES.find((candidate) => candidate === theme);
  if (!knownTier || !knownViewport || !knownTheme) return null;

  return { tier: knownTier, viewport: knownViewport, theme: knownTheme, id };
}

/** The allowance a variant has to clear, at two levels because one number cannot
 *  serve both ends of the matrix: 40 pixels is a floor that lets antialiasing noise
 *  through on a 200px-wide atom, where the ratio alone would be brutal, and the ratio
 *  is what keeps a 1280x800 template from being held to those same 40 pixels. */
export const THRESHOLDS = { maxDiffPixels: 40, maxDiffRatio: 0.0005 };

/** Everything the capture loop needs to render the same bytes twice, on two machines.
 *  `determinism.mjs` and `capture.mjs` read these; neither restates one. */
export const DETERMINISM = {
  /** Wait between the two shots the stability check compares. A range, not a point,
   *  and drawn UNIFORMLY from it on every attempt — `capture.mjs`'s `stableWaitMs`
   *  samples fresh each time rather than climbing. This comment used to claim retries
   *  "back off from `min` toward `max`"; nothing implemented that, and a reader tuning
   *  the range was reading a schedule the code does not have.
   *
   *  The range is still the point: a cold CI runner needs the long wait that would tax
   *  every fast story if it were the only one, and jitter means a run does not
   *  synchronise all four pages onto the same beat. */
  stableShotIntervalMs: { min: 300, max: 450 },

  /** Attempts at a pair of identical shots before the story is reported unstable. */
  retries: 3,

  /** Seed for the page's stubbed `Math.random` (the golden-ratio constant). Imported
   *  by `determinism.mjs`, never restated there. */
  rngSeed: 0x9e3779b9,

  /** Chromium flags that take machine-dependent text rendering out of the picture —
   *  the difference between a laptop and the CI container is mostly subpixel
   *  antialiasing and font hinting, and colour management is pinned to the one
   *  profile a baseline PNG can encode. */
  launchArgs: [
    '--disable-lcd-text',
    '--disable-font-subpixel-positioning',
    '--font-render-hinting=none',
    '--force-color-profile=srgb',
    '--disable-skia-runtime-opts',
  ],

  /** {@link VIEWPORTS} is CSS pixels; at any other factor the same layout is a
   *  differently-sized image and every baseline is invalidated. */
  deviceScaleFactor: 1,
};

/** Transcribed from the exact `@playwright/test` pin `apps/e2e` carries: the image
 *  ships the browser builds of that one release, and a tag a minor off the installed
 *  library renders text differently enough to redden the whole matrix. Bump the two
 *  together, never one alone. */
const PLAYWRIGHT_IMAGE_TAG = 'v1.62.1-noble';

/** The one host baselines are captured on. Every capture runs in this container,
 *  locally as well as in CI — a baseline is only comparable to a shot from the same
 *  renderer. */
export const HOST = {
  image: `mcr.microsoft.com/playwright:${PLAYWRIGHT_IMAGE_TAG}`,

  /** The fields of `BASELINE_ENV.json` a run has to match before its shots are
   *  comparable to the committed baselines. `chromium` is recorded in that file for a
   *  human reading it but is deliberately absent here: it is a property of the pinned
   *  {@link HOST.image}, which *is* compared, and the guard runs before a browser
   *  exists to ask for a version.
   *  @type {readonly string[]} */
  comparedKeys: ['platform', 'arch', 'image', 'playwright'],
};

/** Run artifacts. Baselines are committed; everything under here is per-run output. */
const ARTIFACTS = 'packages/visual-diff/.visual-diff';

/** Underscored like `__tests__`: the directory is a fixture set the tooling owns, and
 *  the name keeps it from reading as a source folder anyone edits by hand. */
const BASELINES = 'packages/visual-diff/__baselines__';

/** The stamp beside a corpus: which host captured it — what `accept` restamps, and
 *  what `check`'s host guard reads back. */
export const BASELINE_ENV = 'BASELINE_ENV.json';

/** Repo-root-relative, so a path means the same thing whichever workspace the CLI
 *  was invoked from. */
export const PATHS = {
  baselines: BASELINES,

  /** The host the committed baselines were captured on, restamped by every `accept`. */
  baselineEnv: `${BASELINES}/${BASELINE_ENV}`,

  artifacts: ARTIFACTS,
  diffs: `${ARTIFACTS}/diffs`,
  summaryJson: `${ARTIFACTS}/summary.json`,
  summaryMd: `${ARTIFACTS}/summary.md`,

  /** Every Storybook build the differ reads, each with its own `index.json` and
   *  served on its own for its own stories: Storybook refs never merge into a static
   *  index, so a composed Storybook's stories are read from the build that owns them.
   *  One here; a child with a native Storybook lists its build second. */
  storybookStatics: ['apps/storybook/storybook-static'],
};

/** Process exit codes. Three, and no more: a reader of a red CI job has to learn from
 *  the number alone whether the UI changed or the differ did, and every further code is
 *  a distinction the workflow then has to branch on. */
export const EXIT = {
  ok: 0,

  /** A human must look. Any variant that is not `unchanged` lands here — a story past
   *  {@link THRESHOLDS}, a story with no baseline yet, a baseline no story claims, an
   *  axe violation. Accepting one is a deliberate act, never an implicit pass. */
  diff: 1,

  /** The gate itself is broken, so no verdict from this run means anything: the corpus
   *  never built, a sanity gate proved the run blind, the host is not the one the
   *  baselines were captured on, or an `accept` blew {@link BASELINE_BUDGET_BYTES}.
   *  Deliberately not merged into {@link EXIT.diff} — a changed UI is a report worth
   *  reading, and this is a run that never had one. */
  broken: 2,
};

/** Total budget for the committed baseline set. Baselines live in git forever, so the
 *  ceiling is on the whole directory. 8 MB since the console's own pages joined as
 *  `screens`: five of them, each a page tall at both viewports in both themes, where
 *  the four design-system tiers fit in under 3 MB. */
export const BASELINE_BUDGET_BYTES = 8_000_000;

/** Ceiling on one committed baseline. Under the total on purpose: a single PNG this
 *  large is a story rendering something it should not — a whole page shot as an atom,
 *  a photograph inlined into a fixture — and the corpus budget would not catch it until
 *  ten more had landed beside it. */
export const BASELINE_PNG_BUDGET_BYTES = 512_000;

/** Both budgets, over the set a caller is about to commit. Baselines live in git
 *  forever, so the ceilings are checked before a byte is written and a corpus that
 *  would blow either one is refused whole rather than left half-promoted.
 *
 *  A refusal names the stories: "the corpus is too big" is not something a reviewer
 *  can act on, and the offending story usually is.
 *
 *  Here rather than in the caller so the ceiling has one home. It had two callers
 *  until the console's `promote` was retired — that one wrote a gitignored corpus
 *  nothing read — and one ceiling enforced in two places is one that can drift.
 *  @param {ReadonlyMap<string, Uint8Array>} shots The set about to be written.
 *  @param {number} retainedBytes Committed bytes this write does not replace.
 *  @throws {Error} */
export function assertWithinBudget(shots, retainedBytes) {
  const oversized = [...shots]
    .filter(([, bytes]) => bytes.length > BASELINE_PNG_BUDGET_BYTES)
    .map(([key]) => key);
  if (oversized.length > 0) {
    throw new Error(
      `${oversized.length} baseline(s) over the ${BASELINE_PNG_BUDGET_BYTES}-byte per-file budget (${oversized.join(', ')}) — nothing was written`,
    );
  }

  const total =
    retainedBytes + [...shots.values()].reduce((sum, bytes) => sum + bytes.length, 0);
  if (total > BASELINE_BUDGET_BYTES) {
    throw new Error(
      `the baseline set would be ${total} bytes, over the ${BASELINE_BUDGET_BYTES}-byte budget — nothing was written`,
    );
  }
}

/** @typedef {{ anchor: string, properties: readonly string[], px: number, reason: string }} LedgerExemption */

/** What a token ledger measures and how it names what it measured — the one home for
 *  the numbers `ledger.mjs` classifies with, so a reading can be argued about in one
 *  place.
 *
 *  The scale itself is NOT here. A capture reads it off the live root — every custom
 *  property that starts with {@link LEDGER.scalePrefix} — so tokens.css stays its only
 *  source and nothing here can drift from it.
 *
 *  - `properties`: longhands only. A shorthand is read through them, and `gap` is the
 *    row/column pair. Margin is deliberately out: `auto`, negative values, collapse and
 *    the browser's own 1em/40px margins would be most of what it reported.
 *  - `tolerancePx` 0: a pixel differ does not round a pixel away, so 16.5 is off the
 *    scale, not `--space-4`.
 *  - `nearestTie` `lower`: 18 sits between 16 and 20 and is named against 16.
 *  - `relativeUnits`: a value written in one of these is a function of its context,
 *    not a choice from the scale, and is exempt rather than off it. `rem` is not among
 *    them — it is the unit the scale is written in.
 *  - `exempt`: the only paddings in packages/ui that sit off the scale on purpose,
 *    each with the reason a reader is shown. A match needs the anchor, the property
 *    and the px; anything else off the scale is still reported.
 *  - `cdpBudgetMs`: per variant. Measured at 37–64 ms for 8–12 elements, so this
 *    only ever stops a capture that has gone wrong.
 *  @type {Readonly<{ scalePrefix: string, properties: readonly string[],
 *    tolerancePx: number, decimals: number, nearestTie: 'lower' | 'upper',
 *    relativeUnits: readonly string[], exempt: readonly LedgerExemption[],
 *    cdpBudgetMs: number, fileSuffix: string, reportDir: string }>} */
export const LEDGER = Object.freeze({
  scalePrefix: '--space-',
  properties: Object.freeze([
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'row-gap',
    'column-gap',
  ]),
  tolerancePx: 0,
  decimals: 2,
  nearestTie: 'lower',
  relativeUnits: Object.freeze(['%', 'em', 'ch', 'vw', 'vh']),
  exempt: Object.freeze([
    {
      anchor: 'ds-badge',
      properties: ['padding-top', 'padding-bottom'],
      px: 2,
      reason: 'pill half-step',
    },
    {
      anchor: 'ds-tag',
      properties: ['padding-top', 'padding-bottom'],
      px: 2,
      reason: 'pill half-step',
    },
    {
      anchor: 'ds-bucket-chip',
      properties: ['padding-top', 'padding-bottom'],
      px: 2,
      reason: 'pill half-step',
    },
    {
      anchor: 'ds-theme-toggle',
      properties: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
      px: 3,
      reason: 'track inset',
    },
  ]),
  cdpBudgetMs: 1000,
  fileSuffix: '.ledger.json',
  reportDir: 'ledger',
});
