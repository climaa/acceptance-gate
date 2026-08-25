// The link footer the PR comment carries and `summary.md` does not.
//
// This lives beside `artifacts.mjs` rather than inside it on purpose. `renderSummaryMd`
// renders from `summary.json` alone so the file and the comment cannot disagree about
// what changed, and it has no run to name when a developer produces the file locally.
// Run-specific URLs are therefore a separate concern with a separate input — the CI
// context — and this module is where that concern lives.
//
// It exists as a module rather than as script text inside `pr.yml` because logic in a
// YAML string is logic nothing can test. `.github/workflows/pr.yml` imports it.

/** A code span that survives a value containing backticks — git permits them in ref
 *  names (`git check-ref-format --branch 'a`b'` passes), and a naive `` `${ref}` ``
 *  closes the span early and leaves the rest as prose. CommonMark: a span fenced by N
 *  backticks holds runs of up to N-1, and a value that starts or ends with one needs a
 *  padding space, which the renderer strips back off.
 *  @param {string} value @returns {string} */
export function codeSpan(value) {
  const runs = [...value.matchAll(/`+/g)].map((match) => match[0].length);
  const fence = '`'.repeat(Math.max(0, ...runs) + 1);
  const pad = value.startsWith('`') || value.endsWith('`') ? ' ' : '';

  return `${fence}${pad}${value}${pad}${fence}`;
}

/** The footer for one run, or `''` when the run needs none.
 *
 *  Three states, and the one that matters is the third. `remediated` is read from the
 *  rendered body (`### To fix` present), never from the job's outcome: a step outcome of
 *  `failure` covers a real diff (exit 1) and a broken run (exit 2) alike, and a broken
 *  run wrote no report and measured nothing — handing it a `report.html` link and an
 *  invitation to accept would be pointing at a file that does not exist.
 *
 *  @param {object} run
 *  @param {boolean} run.remediated Body carries remediation — a real diff to review.
 *  @param {boolean} run.summarised A summary was produced at all (false = broken run).
 *  @param {string} run.runUrl
 *  @param {string} run.artifactUrl Empty when the upload found no files; falls back.
 *  @param {string} run.workflowUrl
 *  @param {string} run.branch
 *  @param {boolean} run.sameRepo Fork PRs cannot dispatch — see the workflow.
 *  @param {number} run.retentionDays
 *  @returns {string} */
export function renderCommentFooter(run) {
  const here = `[this run](${run.runUrl})`;
  if (!run.remediated) return run.summarised ? '' : here;

  return [
    `[**report.html**](${run.artifactUrl || run.runUrl}) — download the`,
    `${codeSpan('visual-diff-report')} artifact, unzip, untar, open the file.`,
    `Kept ${run.retentionDays} days.`,
    run.sameRepo
      ? `· [**dispatch ${codeSpan('accept-baselines')}**](${run.workflowUrl}) on ${codeSpan(run.branch)}`
      : '',
    `· ${here}`,
  ]
    .filter(Boolean)
    .join(' ');
}

/** The whole comment body: the marker, the rendered summary, and the footer separated by
 *  a BLANK line. Never a bare `\n` — GFM reads a single newline as a lazy continuation of
 *  remediation step 3 and swallows the footer into that list item.
 *  @param {string} marker @param {string} summary @param {string} footer
 *  @returns {string} */
export function renderCommentBody(marker, summary, footer) {
  return [`${marker}\n${summary.trimEnd()}`, footer].filter(Boolean).join('\n\n');
}
