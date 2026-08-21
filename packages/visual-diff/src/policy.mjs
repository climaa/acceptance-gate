// @ts-check
//
// The one place every visual-diff literal is written. It is imported by
// `packages/ui/eslint.config.mjs`, by Storybook's `preview.tsx` and by the capture
// CLI, so it stays zero-import and side-effect free: `preview.tsx` loads it through
// Vite, and `capture.mjs` is the only module allowed a `playwright` import.

/** @typedef {'atoms' | 'molecules' | 'organisms' | 'templates'} Tier */
/** @typedef {'light' | 'dark'} Theme */
/** @typedef {'desktop' | 'mobile'} ViewportName */
/** @typedef {{ tier: Tier, viewport: ViewportName, theme: Theme }} Mode */
/** @typedef {Mode & { id: string }} Variant */

/** Atomic-design tiers, innermost first. Import order matters: the layering rule
 *  allows a tier to import only from tiers earlier in this array.
 *  @type {readonly Tier[]} */
export const TIERS = ['atoms', 'molecules', 'organisms', 'templates'];

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

/** Storybook's story root: the element every non-fullpage shot is taken of. */
export const CAPTURE_TARGET = '#storybook-root';

/** The Storybook *global* driving the theme, named once for both consumers.
 *  A global rather than a parameter because only a global can be set from the capture
 *  URL. The name has to be identical on both sides: name it `theme` in the toolbar and
 *  `colorScheme` in the URL and every dark capture silently renders light, which lands
 *  as byte-identical dark baselines that look exactly like a passing gate. */
export const COLOR_SCHEME_GLOBAL = 'colorScheme';

const UI_SRC = ['packages', 'ui', 'src'];

/** @param {readonly string[]} segments @param {number} index */
const uiSrcStartsAt = (segments, index) =>
  UI_SRC.every((segment, offset) => segments[index + offset] === segment);

/** The tier a story belongs to, derived from its `importPath`. Anything outside
 *  `packages/ui/src/<tier>/` — the barrels, a path in another workspace — is `null`
 *  rather than a guess: a story the matrix cannot place is reported, never captured
 *  under a tier it does not have.
 *  @param {string} storyPath
 *  @returns {Tier | null} */
export function tierOf(storyPath) {
  const segments = storyPath.replaceAll('\\', '/').split('/');
  const start = segments.findIndex((_, index) => uiSrcStartsAt(segments, index));
  if (start === -1) return null;

  const candidate = segments[start + UI_SRC.length];
  return TIERS.find((tier) => tier === candidate) ?? null;
}

/** Storybook ids are `[a-z0-9-]` only, so a doubled underscore cannot occur inside
 *  one and a key splits back into its fields unambiguously. */
const KEY_SEPARATOR = '__';

const VIEWPORT_NAMES = /** @type {readonly ViewportName[]} */ (Object.keys(VIEWPORTS));

/** The baseline filename contract — one key per captured variant, `.png` appended by
 *  the writer. `parseVariantKey(variantKey(v))` deep-equals `v`.
 *  @param {Variant} variant
 *  @returns {string} */
export function variantKey({ tier, viewport, theme, id }) {
  return [tier, viewport, theme, id].join(KEY_SEPARATOR);
}

/** The inverse of {@link variantKey}. `null` for a key naming a cell outside the
 *  matrix, so a baseline left behind by a retired tier or theme is reported as an
 *  orphan instead of being read back as a variant nothing captures.
 *  @param {string} key
 *  @returns {Variant | null} */
export function parseVariantKey(key) {
  const [tier, viewport, theme, ...rest] = key.split(KEY_SEPARATOR);
  const id = rest.join(KEY_SEPARATOR);
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
  /** Wait between the two shots the stability check compares. A range, not a point:
   *  retries back off from `min` toward `max`, because a cold CI runner needs the
   *  long wait that would tax every fast story if it were the only one. */
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

/** The stamp beside a corpus: which host captured it. Named on its own because two
 *  corpora carry one — the committed baselines under {@link PATHS}, and the one a
 *  console promotes into its data directory (see promote.mjs). */
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
  reportHtml: `${ARTIFACTS}/report.html`,
  storybookStatic: 'apps/storybook/storybook-static',
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
 *  ceiling is on the whole directory. */
export const BASELINE_BUDGET_BYTES = 5_000_000;

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
 *  Here rather than in either caller because there are two of them, committing the
 *  same directory by different routes — the CLI's `accept`, which promotes what it
 *  just captured, and the console's, which promotes what a reviewer accepted out of
 *  a report. One ceiling enforced in two places is one ceiling that can drift.
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
