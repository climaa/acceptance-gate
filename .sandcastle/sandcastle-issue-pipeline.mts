// Pure decisions from the per-issue implement→build→review pipeline, extracted
// from runIssue() in sandcastle-run-issue.mts.
//
// runIssue() was 131 lines — the only production function in fallow's "very
// high risk" band (>60 LOC) — and mixed three sandbox round-trips with the
// branching between them. The round-trips have to stay there; these do not.
//
// Imports nothing, so loading it drags in no IO.

/**
 * Whether the reviewer should run after the implementer.
 *
 * Three independent reasons to review, and the last two are the subtle ones:
 *
 *  - `salvaged` — the implementer threw (typically AgentIdleTimeoutError) but
 *    the branch already had commits ahead of base. The work exists; only the
 *    completion signal was lost. Discarding it would throw away real work.
 *  - `implementCommitCount > 0` — the ordinary path.
 *  - `branchAhead` — an idempotent implementer that finds the work already done
 *    reports zero commits. Without this term the merge phase is skipped
 *    forever and the branch never lands.
 */
export function shouldReview(input: {
  salvaged: boolean;
  implementCommitCount: number;
  branchAhead: boolean;
}): boolean {
  return input.salvaged || input.implementCommitCount > 0 || input.branchAhead;
}

/**
 * Commits from both agent runs, in the order they happened.
 *
 * The merge phase reads this list, so dropping either side loses commits from
 * the PR body. `implementCommits` is empty on the salvage path, where the
 * implementer's result object was never returned.
 */
export function mergeCommitLists<T>(
  implementCommits: readonly T[] | undefined,
  reviewCommits: readonly T[],
): T[] {
  return [...(implementCommits ?? []), ...reviewCommits];
}

/**
 * The `[summary]` line closing each issue. Kept here so the run log's shape is
 * pinned by a test rather than by whoever last edited the template string —
 * it is the per-issue cost record.
 */
export function formatIssueSummary(input: {
  id: string;
  implement: string;
  build: string;
  review: string;
}): string {
  return (
    `[summary] issue #${input.id}: implement ${input.implement} | ` +
    `${input.build} | review ${input.review}`
  );
}

/**
 * The end-of-iteration safety net: a run that planned N issues must say what
 * happened to every one of them. Retry (sandcastle-lifecycle.mts's
 * `withRetry` + `isRetryableGitError`) makes the common transient-git-failure
 * case survivable; this is what still surfaces it — by id — if a planned
 * issue never lands, whether that pipeline threw after retries were
 * exhausted or the issue was never attempted at all (e.g. a shutdown
 * mid-iteration). Returns null when every planned issue resolved, so the
 * caller only logs when there is something to report.
 */
export function formatUnresolvedSummary(
  unresolved: readonly { id: string; branch: string; reason: string }[],
): string | null {
  if (unresolved.length === 0) return null;
  const lines = unresolved.map((u) => `  #${u.id} (${u.branch}) — ${u.reason}`);
  return (
    `\n⚠ ${unresolved.length} planned issue(s) did not produce a merged result ` +
    `this iteration:\n${lines.join('\n')}`
  );
}
