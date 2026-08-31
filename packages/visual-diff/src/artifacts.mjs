// @ts-check
//
// The two rendered artifacts: `summary.json`, the machine-readable record, and the
// PR-comment markdown rendered FROM that record — never from the results array again,
// so the two can never disagree about what changed. Both functions are pure: no fs, no
// clock. The command layer owns paths and writes the bytes this module returns.

import { EXIT, PATHS, THRESHOLDS } from './policy.mjs';

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

/** How long the run took, by phase, in milliseconds.
 *
 *  OPTIONAL, and that is what keeps `schemaVersion` at 1. `check()` attaches it; the
 *  console composes `buildSummary` itself for its compare mode and does not, and the
 *  committed fixtures predate it. A reader that has never heard of this field parses a
 *  file carrying it unchanged — verified against the console's own zod schema, which is
 *  not `.strict()` and drops what it does not name.
 *  `reportMs` covers everything after the comparison: building this object, collecting
 *  the diffs, and writing one PNG per failing variant. It is near-zero on a green run
 *  and is the phase that grows on a red one, which is exactly when a reader wants to
 *  know where the time went.
 *  @typedef {{ captureMs: number, compareMs: number, reportMs: number,
 *              totalMs: number }} SummaryTiming */

/** The `summary.json` object.
 *  @typedef {{ schemaVersion: number, exitCode: number,
 *              thresholds: { maxDiffPixels: number, maxDiffRatio: number },
 *              env: Record<string, string>, counts: Record<Bucket, number>,
 *              warnings: string[], variants: SummaryVariant[],
 *              timing?: SummaryTiming }} Summary */

/** The schema every consumer of `summary.json` reads against. Bump only when a reader
 *  would have to change to keep parsing the file. */
const SCHEMA_VERSION = 1;

/** Canonical bucket order. Every count and grouping in this module iterates this array
 *  rather than `Object.keys` on whatever buckets happen to appear in a run, so
 *  `summary.json`'s key order and the bucket-count line in the comment are the same for
 *  a clean run and a red one.
 *  @type {readonly Bucket[]} */
export const BUCKETS = ['unchanged', 'changed', 'added', 'removed', 'errored', 'a11y'];

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

/** @param {Comparison} row @returns {SummaryVariant} */
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

/** The matrix cell a row belongs to. The three fields are `null` together, for a
 *  baseline whose filename names no cell of the matrix; that row is still printed,
 *  under `?`, because a key nothing can place is exactly what a reader must see.
 *  @param {SummaryVariant} variant @returns {string} */
function formatMode(variant) {
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
function renderTableRow(variant) {
  const cells = [
    escapeCell(variant.id),
    escapeCell(formatMode(variant)),
    String(variant.overlapDiffPixels),
    String(variant.marginPixels),
    formatRatio(variant),
    escapeCell(variant.sizeDelta ?? '—'),
  ];

  return `| ${cells.join(' | ')} |`;
}

/** @param {readonly SummaryVariant[]} variants @returns {string | null} */
function renderTable(variants) {
  if (variants.length === 0) return null;

  const shown = variants.slice(0, MAX_TABLE_ROWS);
  const overflow = variants.length - shown.length;

  const lines = [
    '| story | variant | Δ shared | Δ margin | ratio | size |',
    '| --- | --- | --- | --- | --- | --- |',
    ...shown.map(renderTableRow),
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
    return `- **${escapeCell(variant.id)}** (${formatMode(variant)}): ${violations}`;
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

  const lines = summary.warnings.map((warning) => `- ${warning}`);

  return ['### Warnings', '', ...lines].join('\n');
}

/** The hardware-free path, and the step that must not need a checkout to follow. This is
 *  the one place in the comment that restates mechanism `README.md` owns — deliberately,
 *  against the rule below, because a reader who has to open `packages/visual-diff` to
 *  learn the primary way forward has already lost the thing this step exists to give
 *  them. The wrinkle clause is the load-bearing half: a GITHUB_TOKEN push starts no
 *  workflows, so without it the reader dispatches, gets a commit, and waits on a gate
 *  that will never re-run. `pr.yml` appends the link; this renderer holds no URLs. */
const DISPATCH_ACCEPT_STEP = [
  'If the changes are intentional, dispatch the `accept-baselines` workflow on this',
  'branch (maintainers) — nothing to install, no Docker, no arm64 hardware. It runs the',
  'accept and commits the baselines back to this PR. One wrinkle: that commit re-runs no',
  'checks, so push anything (or close and reopen) to re-arm the gate.',
].join(' ');

/** Linked, never restated: the README stays the single source for the container recipe,
 *  while this is the copy a reader actually sees. It names the bare-metal risk rather
 *  than a command because `accept` has no host guard — a bare-metal run goes green and
 *  the corrupted corpus only surfaces when CI's guard trips. Fragments join on a space,
 *  so re-wrapping the paragraph can't drop a trailing one and run two words together. */
const CONTAINER_ACCEPT_STEP = [
  'Accepting on your own machine instead: it has to run **inside the pinned container**.',
  '`accept` carries no host guard, so a bare-metal run succeeds but silently corrupts the',
  "baseline corpus with your host's font rendering — `packages/visual-diff/README.md` →",
  '"Running the pinned container locally" has the exact commands.',
].join(' ');

/** Dispatch before container, and not for symmetry: the reader without Docker who meets
 *  the container paragraph first has been told the only way in needs hardware they
 *  haven't got, and stops reading before the step that would have unblocked them. */
const REMEDIATION = [
  '### To fix',
  '',
  `1. Review the diff image in \`${PATHS.diffs}/\` for every failing variant.`,
  `2. ${DISPATCH_ACCEPT_STEP}`,
  `3. ${CONTAINER_ACCEPT_STEP}`,
].join('\n');

/** The PR-comment markdown. Its only input is the `summary.json` object, so the file
 *  and the comment cannot disagree about what changed. A section that has nothing to
 *  say renders `null` and is dropped, blank line and all.
 *  @param {Summary} summary
 *  @returns {string} */
export function renderSummaryMd(summary) {
  const sections = [
    renderVerdict(summary),
    renderCountsLine(summary),
    renderTable(summary.variants),
    renderA11ySection(summary.variants),
    renderWarnings(summary),
    summary.exitCode === EXIT.ok ? null : REMEDIATION,
  ];

  return sections.filter((section) => section !== null).join('\n\n');
}
