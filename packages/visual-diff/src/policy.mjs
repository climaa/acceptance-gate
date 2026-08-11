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
};

/** Run artifacts. Baselines are committed; everything under here is per-run output. */
const ARTIFACTS = 'packages/visual-diff/.visual-diff';

/** Repo-root-relative, so a path means the same thing whichever workspace the CLI
 *  was invoked from. */
export const PATHS = {
  baselines: 'packages/visual-diff/baselines',
  artifacts: ARTIFACTS,
  diffs: `${ARTIFACTS}/diffs`,
  reportJson: `${ARTIFACTS}/report.json`,
  reportHtml: `${ARTIFACTS}/report.html`,
  storybookStatic: 'apps/storybook/storybook-static',
};

/** Process exit codes. A reader of a red CI job learns what failed from the code
 *  alone, and the codes are a contract the workflow can branch on. */
export const EXIT = {
  ok: 0,

  /** At least one variant exceeded {@link THRESHOLDS}. The UI changed. */
  diff: 1,

  /** The sanity gate failed — the run proved itself blind (light and dark came back
   *  byte-identical, say), so no green from it means anything. Its own code because
   *  it is a broken differ, not a changed UI, and the two want different responses. */
  sanity: 2,

  /** A story has no baseline yet. Approving it is a deliberate act, never an
   *  implicit pass. */
  missingBaseline: 3,

  /** The committed baselines outgrew {@link BASELINE_BUDGET_BYTES}. */
  budgetExceeded: 4,
};

/** Total budget for the committed baseline set. Baselines live in git forever, so the
 *  ceiling is on the whole directory; the per-PNG cap is the capture CLI's. */
export const BASELINE_BUDGET_BYTES = 5_000_000;
