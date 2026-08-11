// @ts-check
//
// The two rendered artifacts: `summary.json`, the machine-readable record, and the
// PR-comment markdown rendered FROM that record — never from the results array again,
// so the two can never disagree about what changed. Both functions are pure: no fs, no
// clock. The command layer owns paths and writes the bytes this module returns.

import { EXIT, THRESHOLDS } from './policy.mjs';

/** @typedef {import('./compare.mjs').Comparison} Comparison */
/** @typedef {import('./compare.mjs').Bucket} Bucket */

/** One `variants[]` entry — everything a reader needs to place a row and judge it,
 *  minus the diff PNG bytes, which the command layer writes to their own file.
 *  @typedef {{ key: string, id: string, tier: Comparison['tier'],
 *              viewport: Comparison['viewport'], theme: Comparison['theme'],
 *              bucket: Bucket, overlapDiffPixels: number, marginPixels: number,
 *              diffPixels: number, allowedDiffPixels: number, width: number | null,
 *              height: number | null, sizeDelta: string | null,
 *              violations: Comparison['violations'],
 *              error: string | null }} SummaryVariant */

/** The `summary.json` object.
 *  @typedef {{ schemaVersion: number, exitCode: number,
 *              thresholds: { maxDiffPixels: number, maxDiffRatio: number },
 *              env: Record<string, string>, counts: Record<Bucket, number>,
 *              warnings: string[], variants: SummaryVariant[] }} Summary */

/** The schema every consumer of `summary.json` reads against. Bump only when a reader
 *  would have to change to keep parsing the file. */
const SCHEMA_VERSION = 1;

/** Canonical bucket order. Every count and grouping in this module iterates this array
 *  rather than `Object.keys` on whatever buckets happen to appear in a run, so
 *  `summary.json`'s key order — and the bucket-count line in the comment — is the same
 *  for a clean run and a red one.
 *  @type {readonly Bucket[]} */
const BUCKETS = ['unchanged', 'changed', 'added', 'removed', 'errored', 'a11y'];

/** Hard cap on the markdown table. A run with hundreds of failures is a broken-build
 *  event, not two hundred rows a reviewer reads one at a time. */
const MAX_TABLE_ROWS = 20;

/** Code-unit order, matching compare.mjs's own tiebreak: two runs over one corpus must
 *  sort identically wherever they run, and collation depends on the host's ICU build.
 *  @param {string} left @param {string} right */
function compareKeys(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** Worst first, by the shared box, restated from compare.mjs (not exported there):
 *  `buildSummary`'s own input order is not guaranteed sorted, and the JSON this
 *  produces has to be identical either way.
 *  @param {Comparison} left @param {Comparison} right */
function worstFirst(left, right) {
  return (
    right.overlapDiffPixels - left.overlapDiffPixels || compareKeys(left.key, right.key)
  );
}

/** One `variants[]` entry. Everything a reader needs to place the row and judge it —
 *  never the diff PNG bytes, which the command layer writes to its own file per
 *  variant; a JSON summary is not the place for image data.
 *  @param {Comparison} row @returns {SummaryVariant} */
function variantOf(row) {
  return {
    key: row.key,
    id: row.id,
    tier: row.tier,
    viewport: row.viewport,
    theme: row.theme,
    bucket: row.bucket,
    overlapDiffPixels: row.overlapDiffPixels,
    marginPixels: row.marginPixels,
    diffPixels: row.diffPixels,
    allowedDiffPixels: row.allowedDiffPixels,
    width: row.width,
    height: row.height,
    sizeDelta: row.sizeDelta,
    violations: row.violations,
    error: row.error,
  };
}

/** The `summary.json` object: a fixed key order and no timestamp anywhere, so two
 *  compares of the same inputs produce byte-identical JSON — the same determinism
 *  requirement the pinned capture clock carries. `results` need not arrive sorted;
 *  every reachable ordering of the same rows produces the same output.
 *  @param {readonly Comparison[]} results
 *  @param {Readonly<Record<string, string>>} env platform/arch/image/playwright — the
 *    host a baseline is only comparable to a shot from.
 *  @returns {Summary} */
export function buildSummary(results, env) {
  const sorted = [...results].sort(worstFirst);

  const counts = /** @type {Record<Bucket, number>} */ (
    Object.fromEntries(BUCKETS.map((bucket) => [bucket, 0]))
  );
  for (const row of sorted) counts[row.bucket] += 1;

  const variants = sorted.filter((row) => row.bucket !== 'unchanged').map(variantOf);

  return {
    schemaVersion: SCHEMA_VERSION,
    exitCode: variants.length > 0 ? EXIT.diff : EXIT.ok,
    thresholds: { ...THRESHOLDS },
    env: { ...env },
    counts,
    warnings: [],
    variants,
  };
}

/** An unescaped `|` silently truncates a GitHub table row; every cell goes through
 *  this before it is joined.
 *  @param {string} value @returns {string} */
function escapeCell(value) {
  return value.replaceAll('|', '\\|');
}

/** @param {SummaryVariant} variant @returns {string} */
function formatVariant(variant) {
  return [variant.tier ?? '?', variant.viewport ?? '?', variant.theme ?? '?'].join('/');
}

/** How far past its allowance a variant landed. `allowedDiffPixels` is legitimately 0
 *  under `VISUAL_DIFF_STRICT` — a plain division would print `Infinity`.
 *  @param {SummaryVariant} variant @returns {string} */
function formatRatio(variant) {
  if (variant.allowedDiffPixels > 0) {
    return `${(variant.diffPixels / variant.allowedDiffPixels).toFixed(2)}×`;
  }
  return variant.diffPixels > 0 ? '∞×' : '0.00×';
}

/** @param {SummaryVariant} variant @returns {string} */
function tableRow(variant) {
  return [
    escapeCell(variant.id),
    escapeCell(formatVariant(variant)),
    String(variant.overlapDiffPixels),
    String(variant.marginPixels),
    formatRatio(variant),
    escapeCell(variant.sizeDelta ?? '—'),
  ].join(' | ');
}

/** @param {readonly SummaryVariant[]} variants @returns {string} */
function renderTable(variants) {
  const shown = variants.slice(0, MAX_TABLE_ROWS);
  const overflow = variants.length - shown.length;

  const lines = [
    '| story | variant | Δ shared | Δ margin | ratio | size |',
    '| --- | --- | --- | --- | --- | --- |',
    ...shown.map((variant) => `| ${tableRow(variant)} |`),
  ];
  if (overflow > 0) lines.push('', `_...and ${overflow} more._`);

  return lines.join('\n');
}

/** @param {readonly SummaryVariant[]} variants @returns {string | null} */
function renderA11ySection(variants) {
  const a11yVariants = variants.filter((variant) => variant.violations.length > 0);
  if (a11yVariants.length === 0) return null;

  const lines = a11yVariants.map((variant) => {
    const violations = variant.violations
      .map((violation) => `${violation.id} (${violation.nodes})`)
      .join(', ');
    return `- **${escapeCell(variant.id)}** (${formatVariant(variant)}): ${violations}`;
  });

  return ['### Accessibility violations', '', ...lines].join('\n');
}

/** @param {Summary} summary @returns {string} */
function renderCountsLine(summary) {
  return BUCKETS.map((bucket) => `**${bucket}** ${summary.counts[bucket]}`).join(' · ');
}

/** @param {Summary} summary @returns {string} */
function renderVerdict(summary) {
  return summary.exitCode === EXIT.ok
    ? '## Visual diff: ✅ no changes'
    : `## Visual diff: ❌ ${summary.variants.length} variant(s) need review`;
}

/** @param {Summary} summary @returns {string | null} */
function renderWarnings(summary) {
  if (summary.warnings.length === 0) return null;

  return ['### Warnings', '', ...summary.warnings.map((warning) => `- ${warning}`)].join(
    '\n',
  );
}

const REMEDIATION = [
  '### To fix',
  '',
  '1. `pnpm visual-diff`',
  "2. Review `report.html` for every failing variant's diff.",
  '3. `pnpm visual-diff:accept` to accept the intentional changes.',
].join('\n');

/** The PR-comment markdown, rendered from the `summary.json` object — never from the
 *  results array again, so the file and the comment can never disagree about what
 *  changed.
 *  @param {Summary} summary
 *  @returns {string} */
export function renderSummaryMd(summary) {
  const sections = [renderVerdict(summary), renderCountsLine(summary)];

  if (summary.variants.length > 0) {
    sections.push(renderTable(summary.variants));
  }

  const a11ySection = renderA11ySection(summary.variants);
  if (a11ySection) sections.push(a11ySection);

  const warningsSection = renderWarnings(summary);
  if (warningsSection) sections.push(warningsSection);

  if (summary.exitCode !== EXIT.ok) sections.push(REMEDIATION);

  return sections.join('\n\n');
}
