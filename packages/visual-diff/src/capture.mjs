// @ts-check
//
// The one module in this package allowed a `playwright` import, and the only place a
// browser is ever touched. Everything this file can express without one is an exported
// pure function above `captureAll`, unit-tested with no browser in the suite; the
// browser path is verified against a real corpus at the wave's human checkpoint.
//
// `playwright` and `@axe-core/playwright` are reached through `import()` inside the two
// functions that need them, so the pure half loads — and the suite runs — wherever the
// driver is absent.
//
// Every determinism rule here comes from `determinism.mjs` / `policy.DETERMINISM`. None
// is restated: a second copy of the pinned clock or the shot interval is a run that
// disagrees with its own contract.
//
// All in-page code is a string constant rather than an inline arrow. Same reason
// `determinism.mjs` does it: the expressions are evaluated in the browser realm, and
// spelling them as functions here would ask this file's typechecker for a DOM it does
// not have.

import {
  FREEZE_CSS,
  RENDER_PHASE_EXPRESSION,
  buildInitScript,
  isRenderedPhase,
  shotsEqual,
} from './determinism.mjs';
import {
  CAPTURE_TARGET,
  COLOR_SCHEME_GLOBAL,
  DETERMINISM,
  VIEWPORTS,
} from './policy.mjs';

/** @typedef {import('./storybook-index.mjs').PlannedVariant} PlannedVariant */

/** The page pool draining the variant queue. Four rather than one per core: each page
 *  is a live Chromium tab holding a rendered story, and past four the pages contend for
 *  the same compositor and the stable-shot loop starts reshooting. */
export const WORKER_PAGES = 4;

/** The capture URL: the preview iframe directly, never the manager shell — the manager
 *  would load the whole Storybook UI into every shot.
 *
 *  The `globals` colon is written literally and must stay that way: percent-encode it
 *  and Storybook drops the parameter, which lands as a dark capture rendered light —
 *  byte-identical baselines that look exactly like a passing gate.
 *  @param {string} baseUrl origin of the served `storybook-static`
 *  @param {{ id: string, theme: string }} variant
 *  @returns {string} */
export function buildStoryUrl(baseUrl, { id, theme }) {
  const origin = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  return `${origin}/iframe.html?id=${encodeURIComponent(id)}&globals=${COLOR_SCHEME_GLOBAL}:${theme}`;
}

/** `--filter`: a case-insensitive substring of a story's id or its title. Applied by the
 *  CLI to index entries before the plan is expanded, so a filter narrows whole stories
 *  rather than half a matrix row.
 *
 *  An absent *or empty* filter keeps everything — `--filter=` is a caller who typed no
 *  value, never a request to capture nothing.
 *  @param {string | undefined} filter
 *  @param {{ id: string, title?: string }} story
 *  @returns {boolean} */
export function matchesFilter(filter, { id, title = '' }) {
  if (!filter) return true;

  const needle = filter.toLowerCase();
  return id.toLowerCase().includes(needle) || title.toLowerCase().includes(needle);
}

/** Run `items` through a fixed pool of `workers`, one item per worker at a time.
 *
 *  Results come back in *item* order, not completion order: the report names variants by
 *  position, and a slow story finishing last would otherwise shift every verdict after
 *  it onto the wrong row.
 *  @template W, T, R
 *  @param {readonly T[]} items
 *  @param {readonly W[]} workers
 *  @param {(worker: W, item: T) => Promise<R>} handle
 *  @returns {Promise<R[]>} */
export async function drainQueue(items, workers, handle) {
  if (workers.length === 0 && items.length > 0) {
    throw new Error('drainQueue was given no worker to drain the queue with');
  }

  /** @type {R[]} */
  const results = new Array(items.length);
  let next = 0;

  await Promise.all(
    workers.map(async (worker) => {
      while (next < items.length) {
        // Read and bumped with no `await` between them, so two workers can never come
        // away holding the same index.
        const index = next;
        next += 1;

        results[index] = await handle(worker, items[index]);
      }
    }),
  );

  return results;
}

/** {@link VIEWPORTS} looked up by an unvalidated name. A viewport reaches this module as
 *  a plain string — off a plan, off the CLI — so a name outside the matrix has to come
 *  back `undefined` here rather than typecheck as a size.
 *  @type {Record<string, { width: number, height: number } | undefined>} */
const VIEWPORT_SIZES = VIEWPORTS;

/** The viewport each pooled page currently sits at.
 *
 *  A `WeakMap` keyed by the page, never one shared value: the pool holds long-lived
 *  pages, and a shared cache lets one worker's resize satisfy another worker's check —
 *  which shoots "mobile" at 1280 and reports it green. {@link viewportSanity} is the
 *  backstop for exactly that bug.
 *  @type {WeakMap<object, string>} */
const appliedViewport = new WeakMap();

/** Size a page before it navigates. Before, not after: Storybook's viewport addon only
 *  drives a preview embedded in the manager, so a directly-navigated `iframe.html`
 *  cannot be resized from inside the page.
 *  @param {{ setViewportSize: (size: { width: number, height: number }) => Promise<void> }} page
 *  @param {string} viewport
 *  @returns {Promise<void>} */
export async function ensureViewport(page, viewport) {
  if (appliedViewport.get(page) === viewport) return;

  const size = VIEWPORT_SIZES[viewport];
  if (!size) throw new Error(`unknown viewport "${viewport}"`);

  await page.setViewportSize(size);
  appliedViewport.set(page, viewport);
}

/** The gate proved itself blind: not a changed UI but a differ that cannot see the axis
 *  it claims to guard. Its own class because the answer differs — a diff is a report
 *  worth reading, this is a run whose green means nothing. The CLI maps it to
 *  `EXIT.broken`. */
export class SanityError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'SanityError';
  }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** `IHDR` in ASCII: the first chunk of every PNG, at a fixed offset after the signature
 *  and the chunk's own four length bytes. */
const IHDR = [0x49, 0x48, 0x44, 0x52];
const IHDR_OFFSET = PNG_SIGNATURE.length + 4;
const WIDTH_OFFSET = IHDR_OFFSET + IHDR.length;
const HEADER_BYTES = WIDTH_OFFSET + 8;

/** A shot's pixel dimensions, read straight out of the PNG header rather than off the
 *  element that produced it. The committed bytes are what the gate protects, and a
 *  bounding box measured at capture time can disagree with them; `null` for anything
 *  that is not a PNG, which the callers treat as "nothing to check".
 *  @param {Uint8Array | null | undefined} bytes
 *  @returns {{ width: number, height: number } | null} */
export function pngSize(bytes) {
  if (!bytes || bytes.length < HEADER_BYTES) return null;
  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return null;
  if (!IHDR.every((byte, index) => bytes[IHDR_OFFSET + index] === byte)) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(WIDTH_OFFSET),
    height: view.getUint32(WIDTH_OFFSET + 4),
  };
}

/** What either gate reads off a capture. Story ids are unique across the corpus, so an
 *  id plus the axis being held constant identifies a sibling set on its own.
 *  @typedef {{ id: string, viewport: string, theme: string,
 *              bytes?: Uint8Array | null }} SanityShot */

/** Shots grouped into sibling sets that differ only along one axis, keyed by that axis.
 *  Only sets with more than one cell come back: a single-cell set proves nothing either
 *  way, and a run narrowed by `--filter` is full of them.
 *  @template V
 *  @param {readonly SanityShot[]} shots
 *  @param {(shot: SanityShot) => string} groupOf the fields held constant
 *  @param {(shot: SanityShot) => string} axisOf the field that varies
 *  @param {(shot: SanityShot) => V | null} valueOf `null` drops the shot from its set
 *  @returns {{ id: string, cells: Map<string, V> }[]} */
function siblingSets(shots, groupOf, axisOf, valueOf) {
  /** @type {Map<string, { id: string, cells: Map<string, V> }>} */
  const sets = new Map();

  for (const shot of shots) {
    const value = valueOf(shot);
    if (value === null) continue;

    const key = groupOf(shot);
    const set = sets.get(key) ?? { id: shot.id, cells: new Map() };
    set.cells.set(axisOf(shot), value);
    sets.set(key, set);
  }

  return [...sets.values()].filter((set) => set.cells.size > 1);
}

/** @param {Map<string, Uint8Array>} cells theme → the bytes captured in it */
function anyThemeDiffers(cells) {
  const [first, ...rest] = [...cells.values()];
  return rest.some((other) => !shotsEqual(first, other));
}

/** Sanity gate: the theme axis is live.
 *
 *  Every story captured in more than one theme coming back byte-identical means the
 *  theme global never reached the page — and a dark baseline that is secretly a light
 *  one passes forever, silently. The gate fires only on that wiring bug, but that bug
 *  bakes half the matrix into git as wrong bytes.
 *  @param {readonly SanityShot[]} shots
 *  @throws {SanityError} */
export function themeSanity(shots) {
  const sets = siblingSets(
    shots,
    (shot) => `${shot.id} ${shot.viewport}`,
    (shot) => shot.theme,
    (shot) => shot.bytes ?? null,
  );

  if (sets.length === 0) return;
  if (sets.some((set) => anyThemeDiffers(set.cells))) return;

  throw new SanityError(
    `all ${sets.length} stories captured in more than one theme came back ` +
      `byte-identical across themes — the ${COLOR_SCHEME_GLOBAL} global is not ` +
      'reaching the page, so every dark baseline is a light one',
  );
}

/** @param {string} viewport */
const policyWidth = (viewport) => VIEWPORT_SIZES[viewport]?.width ?? 0;

/** @param {Map<string, number>} cells viewport name → the width of its shot */
function reflowed(cells) {
  const byViewport = [...cells.entries()].sort(
    ([left], [right]) => policyWidth(left) - policyWidth(right),
  );

  const atNarrowest = byViewport[0][1];
  const atWidest = byViewport[byViewport.length - 1][1];
  return atNarrowest < atWidest;
}

/** Sanity gate: the viewport axis is live.
 *
 *  Storybook cannot resize a directly-navigated `iframe.html` from inside the page, so a
 *  missed `setViewportSize` leaves no trace in the shot itself — "mobile" simply comes
 *  back 1280 wide and diffs clean against a baseline captured the same wrong way.
 *  @param {readonly SanityShot[]} shots
 *  @throws {SanityError} */
export function viewportSanity(shots) {
  const sets = siblingSets(
    shots,
    (shot) => `${shot.id} ${shot.theme}`,
    (shot) => shot.viewport,
    (shot) => pngSize(shot.bytes)?.width ?? null,
  );

  if (sets.length === 0) return;
  if (sets.some((set) => reflowed(set.cells))) return;

  throw new SanityError(
    `none of the ${sets.length} stories captured at more than one viewport came back ` +
      `narrower at the smaller one (${sets[0].id} among them) — the viewport is not ` +
      'being applied before navigation',
  );
}

/** Playwright words one failure — the capture target occupies no space — differently
 *  across its element-handle and locator paths and across releases, so the set is a
 *  list of spellings rather than one string. Everything outside it is a browser that
 *  broke, which the report has to say instead of blaming the story. */
const ZERO_SIZE_MESSAGES = [
  /has 0 size/i,
  /element is not visible/i,
  /waiting for element to be visible/i,
];

/** Whether a failed element shot was the capture target rendering nothing.
 *  @param {unknown} cause
 *  @returns {boolean} */
export function isZeroSizeError(cause) {
  const message = cause instanceof Error ? cause.message : '';
  return ZERO_SIZE_MESSAGES.some((sign) => sign.test(message));
}

/** Loopback spellings, exact. Never a prefix test: `127.0.0.1.evil.example` starts with
 *  the loopback address and resolves to whatever its owner points it at. */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** Whether a request the page made stays on this machine. Everything else is aborted:
 *  a story that reaches for a web font or an analytics beacon must fail into the same
 *  empty state on every run, not into whatever the network answered this time.
 *  @param {string} url
 *  @returns {boolean} */
export function isLoopbackUrl(url) {
  try {
    return LOOPBACK_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** A `document.fonts.check` argument for the first family of a CSS font stack.
 *
 *  The first family only: a stack that fell through to `sans-serif` has *not* loaded the
 *  face the baseline was taken in, and checking the whole list would pass on the generic
 *  fallback. `null` when the stack is empty — the stylesheet itself never arrived, which
 *  is a louder failure than one missing face and must not read as "font present".
 *  @param {string} fontStack the resolved value of a font custom property
 *  @returns {string | null} */
export function fontCheckSpec(fontStack) {
  const family = (fontStack.split(',')[0] ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .trim();
  if (!family) return null;

  return `1em ${JSON.stringify(family)}`;
}

/** The pause between the two shots the stability check compares.
 *
 *  Jittered inside the policy range rather than fixed, because a fixed pause can align
 *  with the period of whatever is still moving and compare two shots taken at the same
 *  point of its cycle — which reads as stable when nothing is. This is the one place the
 *  capture run is deliberately non-deterministic, and it is non-determinism in *timing*:
 *  a page that has settled returns the same bytes whenever it is asked.
 *  @param {() => number} [random]
 *  @returns {number} */
export function stableWaitMs(random = Math.random) {
  const { min, max } = DETERMINISM.stableShotIntervalMs;

  return Math.round(min + random() * (max - min));
}

/** Whether Storybook is showing its error overlay instead of the story.
 *
 *  Both signals, and the second one qualified: every `iframe.html` carries a hidden
 *  `#error-display`, so its mere presence would bucket the whole corpus as errored. The
 *  body class is how Storybook reveals it; `offsetParent` catches a build that reveals
 *  it some other way. */
export const ERROR_OVERLAY_EXPRESSION = `(() => {
  if (document.body.classList.contains('sb-show-errordisplay')) return true;

  const display = document.querySelector('#error-display');
  return Boolean(display) && display.offsetParent !== null;
})()`;

/** The phase of every render the preview is tracking — read only when the wait for
 *  `RENDER_PHASE_EXPRESSION` timed out, so the failure names the phase the story is
 *  stuck in instead of surfacing as a bare timeout several layers from its cause. The
 *  set of phases that count as finished stays in `determinism.mjs`. */
export const STORY_PHASES_EXPRESSION = `(() => {
  const renders = globalThis.__STORYBOOK_PREVIEW__?.storyRenders ?? [];
  return renders.map((render) => render.phase);
})()`;

/** The face the shot actually renders in, asked of the page rather than transcribed from
 *  `tokens.css`: this is the one value whose drift the check exists to catch. */
const BODY_FONT_EXPRESSION = 'getComputedStyle(document.body).fontFamily';

/** Resolves once every face the page asked for has loaded or failed. */
const FONTS_READY_EXPRESSION = 'document.fonts.ready.then(() => true)';

/** WCAG A and AA, the same four tags the Playwright a11y scenario scans with. */
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** @typedef {import('playwright').Browser} Browser */
/** @typedef {import('playwright').Page} Page */

/** One captured cell of the matrix. `captured` is the neutral bucket: whether it is
 *  unchanged, changed or new is the comparer's verdict, not this module's.
 *  @typedef {PlannedVariant & {
 *    bucket: 'captured' | 'errored' | 'a11y',
 *    bytes: Uint8Array | null,
 *    width: number | null,
 *    height: number | null,
 *    violations: { id: string, nodes: number }[],
 *    error: string | null,
 *  }} CaptureResult */

/** @param {unknown} cause */
const messageOf = (cause) => (cause instanceof Error ? cause.message : String(cause));

/** @param {PlannedVariant} variant @param {CaptureResult['bucket']} bucket
 *  @param {Uint8Array | null} bytes @param {Partial<CaptureResult>} [extra]
 *  @returns {CaptureResult} */
function captureResult(variant, bucket, bytes, extra = {}) {
  const size = pngSize(bytes);

  return {
    ...variant,
    bucket,
    bytes,
    width: size?.width ?? null,
    height: size?.height ?? null,
    violations: [],
    error: null,
    ...extra,
  };
}

/** Wait for the story to finish rendering.
 *
 *  The poll's own timeout is not the verdict: the phases are read back out of the page
 *  and gated with {@link isRenderedPhase}, so a story that never settles is reported as
 *  the phase it is stuck in rather than as a bare timeout several layers from its cause.
 *  A page that died instead makes the read itself throw, which is the honest error.
 *  @param {Page} page */
async function waitForRender(page) {
  await page.waitForFunction(RENDER_PHASE_EXPRESSION).catch(() => undefined);

  const phases = /** @type {string[]} */ (await page.evaluate(STORY_PHASES_EXPRESSION));
  if (phases.length > 0 && phases.every(isRenderedPhase)) return;

  const reported = phases.length > 0 ? phases.join(', ') : 'the preview never started';
  throw new Error(`story never finished rendering (${reported})`);
}

/** @param {Page} page */
async function assertNoErrorOverlay(page) {
  if (await page.evaluate(ERROR_OVERLAY_EXPRESSION)) {
    throw new Error('Storybook showed its error overlay instead of the story');
  }
}

/** The worst silent flake there is: a shot taken between `font-display: block`'s blank
 *  period and the face arriving differs from its baseline in every glyph, and a rerun
 *  makes it disappear. Made loud here rather than left to the comparer.
 *  @param {Page} page */
async function assertFontsLoaded(page) {
  await page.evaluate(FONTS_READY_EXPRESSION);

  const stack = String(await page.evaluate(BODY_FONT_EXPRESSION));
  const spec = fontCheckSpec(stack);
  if (spec === null) throw new Error('the page resolved no body font family');

  const loaded = await page.evaluate(`document.fonts.check(${JSON.stringify(spec)})`);
  if (!loaded) throw new Error(`${spec} had not loaded when the shot was taken`);
}

/** @param {Page} page @param {PlannedVariant} variant @param {string} baseUrl */
async function openStory(page, variant, baseUrl) {
  // Before `goto`, never after — see {@link ensureViewport}.
  await ensureViewport(page, variant.viewport);

  await page.goto(buildStoryUrl(baseUrl, variant), { waitUntil: 'load' });
  await page.addStyleTag({ content: FREEZE_CSS });
  await waitForRender(page);
  await assertNoErrorOverlay(page);
  await assertFontsLoaded(page);
}

/** @param {Page} page @param {PlannedVariant} variant @returns {Promise<Uint8Array>} */
async function shootTarget(page, variant) {
  if (variant.fullPage) {
    return page.screenshot({ animations: 'disabled', fullPage: true });
  }

  try {
    return await page.locator(CAPTURE_TARGET).screenshot({ animations: 'disabled' });
  } catch (cause) {
    if (!isZeroSizeError(cause)) throw cause;
    throw new Error(`${CAPTURE_TARGET} has zero size — the story rendered nothing`);
  }
}

/** Two consecutive identical shots, or the story is reported unstable.
 *  @param {Page} page @param {PlannedVariant} variant @returns {Promise<Uint8Array>} */
async function stableShot(page, variant) {
  let previous = await shootTarget(page, variant);

  for (let attempt = 0; attempt <= DETERMINISM.retries; attempt += 1) {
    await page.waitForTimeout(stableWaitMs());

    const next = await shootTarget(page, variant);
    if (shotsEqual(previous, next)) return next;
    previous = next;
  }

  throw new Error(
    `still moving after ${DETERMINISM.retries} retries — nothing here can be baselined`,
  );
}

/** Axe over the story as captured, *after* the shot: the pixels are the artifact this
 *  run exists to produce, and nothing that touches the page precedes them.
 *  @param {Page} page @returns {Promise<CaptureResult['violations']>} */
async function runAxe(page) {
  // The named export, not the default: the package ships both, and its CJS half makes
  // `default` the module object rather than the class under a NodeNext resolver.
  const { AxeBuilder } = await import('@axe-core/playwright');

  const { violations } = await new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze();
  return violations.map((violation) => ({
    id: violation.id,
    nodes: violation.nodes.length,
  }));
}

/** One variant, start to finish. Never throws: a story that fails takes its own row in
 *  the report and the pool moves on, because one broken story must not cost the run its
 *  other hundred-odd shots.
 *
 *  The failure path still tries for a viewport shot — the error overlay, the empty
 *  capture target and the half-rendered story are all things a human needs to *see* to
 *  diagnose.
 *  @param {Page} page @param {PlannedVariant} variant @param {string} baseUrl
 *  @returns {Promise<CaptureResult>} */
async function captureVariant(page, variant, baseUrl) {
  try {
    await openStory(page, variant, baseUrl);
    const bytes = await stableShot(page, variant);
    const violations = await runAxe(page);

    return captureResult(variant, violations.length > 0 ? 'a11y' : 'captured', bytes, {
      violations,
    });
  } catch (cause) {
    const bytes = await page.screenshot({ animations: 'disabled' }).catch(() => null);
    return captureResult(variant, 'errored', bytes, { error: messageOf(cause) });
  }
}

/** A Chromium pinned to the flags that take machine-dependent text rendering out of the
 *  picture. The caller owns closing it.
 *  @returns {Promise<Browser>} */
export async function launchBrowser() {
  const { chromium } = await import('playwright');

  return chromium.launch({ args: [...DETERMINISM.launchArgs] });
}

/** Shoot every variant: one browser, one context, {@link WORKER_PAGES} pages draining a
 *  shared queue.
 *
 *  One context for the whole run, not one per variant — the pinned clock, the seeded
 *  RNG and the network block are context-level, and re-establishing them per story
 *  would be per-story odds of getting one of them wrong.
 *
 *  The sanity gates are exported, not called here: the command layer runs them between
 *  capture and compare so a tripped gate is reported as its own verdict.
 *  @param {{ variants: readonly PlannedVariant[], baseUrl: string, browser: Browser }} run
 *  @returns {Promise<CaptureResult[]>} */
export async function captureAll({ variants, baseUrl, browser }) {
  const context = await browser.newContext({
    reducedMotion: 'reduce',
    deviceScaleFactor: DETERMINISM.deviceScaleFactor,
  });

  // Both before any page exists, so nothing can navigate ahead of them.
  await context.addInitScript(buildInitScript());
  await context.route('**/*', (route) =>
    isLoopbackUrl(route.request().url()) ? route.continue() : route.abort(),
  );

  try {
    const pages = await Promise.all(
      Array.from({ length: WORKER_PAGES }, () => context.newPage()),
    );

    return await drainQueue(variants, pages, (page, variant) =>
      captureVariant(page, variant, baseUrl),
    );
  } finally {
    await context.close();
  }
}
