// @ts-check
//
// The review document a human opens when the gate goes red. It has to work over
// `file://` — no fetches, no external stylesheets or scripts, no fonts pulled from a
// CDN — so every asset a card needs is inlined as a `data:` URI and the whole page is
// one string this module hands back. Pure: no fs, no clock, no browser. The command
// layer owns the path it writes this string to.

import { Buffer } from 'node:buffer';

import { BUCKETS } from './artifacts.mjs';
import { EXIT, TIERS } from './policy.mjs';

/** @typedef {import('./artifacts.mjs').Summary} Summary */
/** @typedef {import('./artifacts.mjs').SummaryVariant} SummaryVariant */

/** The PNG buffers a card can show, keyed by the same `key` a `SummaryVariant`
 *  carries. A bucket that never had a baseline (`added`) or never had a candidate
 *  (`removed`) simply omits that field — the card renders a placeholder for it rather
 *  than a broken `<img>`.
 *  @typedef {{ baseline?: Uint8Array, candidate?: Uint8Array,
 *              diff?: Uint8Array }} VariantImages */

/** How often the blink toggle swaps candidate for baseline. Fast enough that the eye
 *  locks onto the pixel that moved, slow enough to still read as two distinct frames. */
const BLINK_INTERVAL_MS = 400;

/** Bucket sections rendered after `changed`, in this order. `unchanged` never reaches
 *  the report — `buildSummary` already dropped it from `variants[]` — so it is skipped
 *  here rather than rendered as an always-empty section.
 *  @type {readonly SummaryVariant['bucket'][]} */
const TRAILING_BUCKETS = BUCKETS.filter(
  (bucket) => bucket !== 'unchanged' && bucket !== 'changed',
);

const SECTION_TITLES = /** @type {Record<SummaryVariant['bucket'], string>} */ ({
  changed: 'Changed',
  added: 'Added',
  removed: 'Removed',
  errored: 'Errored',
  a11y: 'Accessibility',
});

/** @type {Readonly<Record<string, string>>} */
const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Every value a `Summary` carries goes through this before it lands in the page,
 *  text and attribute alike. Deliberately not `artifacts.mjs`'s `escapeCell`, which
 *  escapes for a GitHub table cell (`|`): that is the wrong alphabet here, and would
 *  both leave a story id reading `<script>` live in the page and print a stray
 *  backslash in front of every pipe.
 *  @param {string} value @returns {string} */
function escapeHtml(value) {
  return value.replaceAll(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/** @param {Uint8Array} bytes @returns {string} */
function dataUri(bytes) {
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}

/** One shot of a card's triptych, or the box standing in for the shot a bucket never
 *  had. `role` names the shot for the compare tools' selector, the alt text and the
 *  placeholder alike.
 *  @param {Uint8Array | undefined} bytes @param {string} role @returns {string} */
function shotOrPlaceholder(bytes, role) {
  const label = escapeHtml(role);
  if (!bytes) {
    return `<div class="shot placeholder">no ${label}</div>`;
  }
  return `<img class="shot" data-role="${label}" src="${dataUri(bytes)}" alt="${label}" loading="lazy" />`;
}

/** @param {string} caption @param {string} content @returns {string} */
function renderFigure(caption, content) {
  return `<figure><figcaption>${caption}</figcaption>${content}</figure>`;
}

/** `allowedDiffPixels` is legitimately 0 under strict mode; a plain division would
 *  print `Infinity`. Restated from `artifacts.mjs`'s own `formatRatio` — the pixel
 *  arithmetic is small enough that sharing it is not worth an export neither module
 *  otherwise needs.
 *  @param {SummaryVariant} variant @returns {string} */
function formatRatio(variant) {
  if (variant.allowedDiffPixels > 0) {
    return `${(variant.diffPixels / variant.allowedDiffPixels).toFixed(2)}×`;
  }
  return variant.diffPixels > 0 ? '∞×' : '0.00×';
}

/** @param {SummaryVariant} variant @returns {string} */
function formatMode(variant) {
  return [variant.tier ?? '?', variant.viewport ?? '?', variant.theme ?? '?'].join('/');
}

/** `iframe.html?id=<id>&globals=colorScheme:<theme>` against the running Storybook —
 *  a convenience that 404s when nothing is running. The `globals` colon has to stay
 *  literal: percent-encoding it makes Storybook ignore the parameter, so only `id`
 *  goes through `encodeURIComponent`.
 *  @param {SummaryVariant} variant @returns {string | null} */
function deepLink(variant) {
  if (!variant.theme) return null;

  const id = encodeURIComponent(variant.id);
  return `http://localhost:6006/iframe.html?id=${id}&globals=colorScheme:${variant.theme}`;
}

/** The baseline/candidate overlay both compare tools drive. Rendered only when both
 *  images exist — blink and onion-skin have nothing to compare against a placeholder.
 *  Its two `<img>` start with no `src`; the bootstrap script at the foot of the page
 *  copies it from the triptych's own images rather than inlining the same base64 a
 *  second time, which is what keeps a failing-heavy run's report in the low megabytes.
 *  @param {boolean} hasBoth @returns {string} */
function renderCompareTools(hasBoth) {
  if (!hasBoth) return '';

  return `
    <div class="compare">
      <div class="compare-stage">
        <img class="compare-base" alt="" />
        <img class="compare-over" alt="" />
      </div>
      <div class="compare-controls">
        <button type="button" class="blink-toggle">Blink</button>
        <label>Onion <input type="range" class="onion-slider" min="0" max="100" value="50" /></label>
      </div>
    </div>`;
}

/** @param {SummaryVariant['violations']} violations @returns {string} */
function renderViolations(violations) {
  const items = violations
    .map(
      (violation) =>
        `<li><code>${escapeHtml(violation.id)}</code> (${violation.nodes})</li>`,
    )
    .join('');

  return `<ul class="violations">${items}</ul>`;
}

/** One card: the metrics a reviewer needs to judge the row, then the triptych. Its
 *  third panel is the diff image, except for `a11y` — which fails on the violation
 *  regardless of what the pixels did, so it shows the violation list instead.
 *  @param {SummaryVariant} variant @param {ReadonlyMap<string, VariantImages>} images
 *  @returns {string} */
function renderCard(variant, images) {
  const { baseline, candidate, diff } = images.get(variant.key) ?? {};
  const link = deepLink(variant);

  const thirdPanel =
    variant.bucket === 'a11y'
      ? renderFigure('violations', renderViolations(variant.violations))
      : renderFigure('diff', shotOrPlaceholder(diff, 'diff'));

  return `
    <article class="card" data-bucket="${escapeHtml(variant.bucket)}">
      <header>
        <h3>${escapeHtml(variant.id)}</h3>
        <span class="mode">${escapeHtml(formatMode(variant))}</span>
        <span class="metric">shared Δ ${variant.overlapDiffPixels}</span>
        <span class="metric">margin Δ ${variant.marginPixels}</span>
        <span class="metric">${formatRatio(variant)}</span>
        <span class="metric">${escapeHtml(variant.sizeDelta ?? '—')}</span>
        ${link ? `<a class="deep-link" href="${link}" target="_blank" rel="noopener">open in storybook</a>` : ''}
      </header>
      ${variant.error ? `<p class="error">${escapeHtml(variant.error)}</p>` : ''}
      <div class="triptych">
        ${renderFigure('baseline', shotOrPlaceholder(baseline, 'baseline'))}
        ${renderFigure('candidate', shotOrPlaceholder(candidate, 'candidate'))}
        ${thirdPanel}
      </div>
      ${renderCompareTools(Boolean(baseline && candidate))}
    </article>`;
}

/** One tier's worth of `changed` cards, or nothing at all when the tier has none.
 *  @param {string} tier @param {readonly SummaryVariant[]} rows
 *  @param {ReadonlyMap<string, VariantImages>} images @returns {string} */
function renderTierGroup(tier, rows, images) {
  if (rows.length === 0) return '';

  return `
    <section class="tier-group">
      <h2>${escapeHtml(tier)}</h2>
      ${rows.map((row) => renderCard(row, images)).join('')}
    </section>`;
}

/** The `changed` bucket, grouped by tier in `policy.TIERS` order and sorted within a
 *  group by `overlapDiffPixels` descending. `variants` arrives already sorted that way
 *  (`buildSummary`'s own contract), so filtering by tier — without re-sorting — keeps
 *  the order; the filter is a stable partition of an already-worst-first array.
 *  @param {readonly SummaryVariant[]} variants
 *  @param {ReadonlyMap<string, VariantImages>} images @returns {string | null} */
function renderChangedSection(variants, images) {
  const changed = variants.filter((variant) => variant.bucket === 'changed');
  if (changed.length === 0) return null;

  const body = TIERS.map((tier) =>
    renderTierGroup(
      tier,
      changed.filter((variant) => variant.tier === tier),
      images,
    ),
  ).join('');

  return `<section class="bucket" data-bucket="changed"><h1>${SECTION_TITLES.changed}</h1>${body}</section>`;
}

/** One of the trailing bucket sections (`added`/`removed`/`errored`/`a11y`), in
 *  `variants`' own worst-first order — no tier grouping, since these buckets are
 *  reported *because* a pixel comparison could not judge them.
 *  @param {SummaryVariant['bucket']} bucket @param {readonly SummaryVariant[]} variants
 *  @param {ReadonlyMap<string, VariantImages>} images @returns {string | null} */
function renderBucketSection(bucket, variants, images) {
  const rows = variants.filter((variant) => variant.bucket === bucket);
  if (rows.length === 0) return null;

  const cards = rows.map((row) => renderCard(row, images)).join('');
  return `<section class="bucket" data-bucket="${bucket}"><h1>${SECTION_TITLES[bucket]}</h1>${cards}</section>`;
}

/** @param {Summary} summary @returns {string} */
function renderHeader(summary) {
  const verdict =
    summary.exitCode === EXIT.ok
      ? '✅ no changes'
      : `❌ ${summary.variants.length} variant(s) need review`;

  const counts = BUCKETS.map(
    (bucket) => `<span class="count">${bucket} ${summary.counts[bucket]}</span>`,
  ).join('');

  const thresholds = `max ${summary.thresholds.maxDiffPixels}px / ${summary.thresholds.maxDiffRatio * 100}%`;

  const env = Object.entries(summary.env)
    .map(
      ([key, value]) =>
        `<span class="env-entry">${escapeHtml(key)}=${escapeHtml(value)}</span>`,
    )
    .join('');

  return `
    <header class="report-header">
      <h1>${verdict}</h1>
      <div class="counts">${counts}</div>
      <div class="thresholds">${escapeHtml(thresholds)}</div>
      <div class="env">${env}</div>
    </header>`;
}

const STYLE = `
  :root { color-scheme: dark; }
  body { margin: 0; padding: 1.5rem; background: #1b1b1f; color: #e6e6e9;
    font: 14px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .report-header { margin-bottom: 1.5rem; }
  .counts, .env { display: flex; gap: 0.75rem; flex-wrap: wrap; font-size: 12px; opacity: 0.85; }
  .bucket > h1 { margin-top: 2rem; border-bottom: 1px solid #3a3a40; padding-bottom: 0.25rem; }
  .tier-group > h2 { text-transform: uppercase; font-size: 12px; letter-spacing: 0.08em;
    opacity: 0.7; margin-top: 1.25rem; }
  .card { background: #242429; border: 1px solid #3a3a40; border-radius: 8px;
    padding: 1rem; margin: 0.75rem 0; }
  .card header { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .card h3 { margin: 0; font-size: 14px; }
  .mode { opacity: 0.7; font-family: monospace; }
  .metric { font-size: 12px; opacity: 0.85; }
  .error { color: #f28b82; }
  .triptych { display: flex; gap: 0.75rem; margin-top: 0.75rem; flex-wrap: wrap; }
  .triptych figure { margin: 0; }
  .triptych figcaption { font-size: 11px; opacity: 0.7; margin-bottom: 0.25rem; }
  .shot { max-width: 320px; image-rendering: pixelated; display: block;
    border: 1px solid #3a3a40; }
  .shot.placeholder { width: 320px; height: 120px; display: flex; align-items: center;
    justify-content: center; opacity: 0.5; border: 1px dashed #3a3a40; }
  .violations { margin: 0; padding-left: 1.1rem; }
  .compare { margin-top: 0.75rem; }
  .compare-stage { position: relative; width: 320px; }
  .compare-base, .compare-over { position: absolute; top: 0; left: 0; max-width: 320px;
    image-rendering: pixelated; }
  .compare-over { clip-path: inset(0 50% 0 0); }
  .compare-controls { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.5rem; }
  .deep-link { color: #8ab4f8; font-size: 12px; }
`;

/** No framework: a click listener for the blink toggle, an input listener for the
 *  onion-skin slider, and a bootstrap pass that points each card's overlay images at
 *  its own triptych images once the DOM exists.
 *  @type {string} */
const SCRIPT = `
  document.querySelectorAll('.card').forEach(function (card) {
    var compare = card.querySelector('.compare');
    if (!compare) return;
    var baseline = card.querySelector('[data-role="baseline"]');
    var candidate = card.querySelector('[data-role="candidate"]');
    compare.querySelector('.compare-base').src = baseline.src;
    compare.querySelector('.compare-over').src = candidate.src;
  });

  document.addEventListener('click', function (event) {
    var button = event.target.closest('.blink-toggle');
    if (!button) return;
    var over = button.closest('.compare').querySelector('.compare-over');
    if (button.dataset.timer) {
      clearInterval(Number(button.dataset.timer));
      delete button.dataset.timer;
      over.style.visibility = 'visible';
      button.textContent = 'Blink';
      return;
    }
    over.style.visibility = 'hidden';
    button.dataset.timer = String(setInterval(function () {
      over.style.visibility = over.style.visibility === 'hidden' ? 'visible' : 'hidden';
    }, ${BLINK_INTERVAL_MS}));
    button.textContent = 'Stop';
  });

  document.addEventListener('input', function (event) {
    var slider = event.target.closest('.onion-slider');
    if (!slider) return;
    var over = slider.closest('.compare').querySelector('.compare-over');
    over.style.clipPath = 'inset(0 ' + (100 - slider.value) + '% 0 0)';
  });
`;

/** The whole review page, over `file://`: one HTML string, everything a card needs
 *  inlined as a `data:` URI, nothing fetched.
 *  @param {Summary} summary the object `artifacts.mjs`'s `buildSummary` produces.
 *  @param {ReadonlyMap<string, VariantImages>} images PNG buffers per variant `key`,
 *    however many of `baseline`/`candidate`/`diff` that variant's bucket has.
 *  @returns {string} */
export function renderReport(summary, images) {
  const sections = [
    renderChangedSection(summary.variants, images),
    ...TRAILING_BUCKETS.map((bucket) =>
      renderBucketSection(bucket, summary.variants, images),
    ),
  ].filter((section) => section !== null);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Visual diff report</title>
<style>${STYLE}</style>
</head>
<body>
${renderHeader(summary)}
${sections.join('')}
<script>${SCRIPT}</script>
</body>
</html>`;
}
