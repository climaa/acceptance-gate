// No-op issues — the third outcome of a per-issue pipeline.
//
// An implementer that finds nothing to do is behaving correctly: it emits the
// completion signal and commits nothing. The orchestrator used to read that as
// "no commits → nothing to merge → issue still open", so the next iteration's
// planner proposed the same issue again, and the run spent a fresh Docker
// sandbox plus a full agent cycle on it every iteration up to MAX_ITERATIONS.
//
// The fix is to give that outcome a name and a record. A no-op issue is marked
// (a comment plus `NOOP_LABEL`) and excluded from re-planning for the rest of
// the run. It is deliberately NOT closed: "nothing to do" can mean the work
// already landed, or that the agent misread the task, and closing would hide
// the second case. A human reads the comment and decides.
//
// Deliberately imports NOTHING from this directory — a layering choice, same as
// sandcastle-model-overrides.mts and sandcastle-worktree-safety.mts.
// sandcastle-config.mts is import-safe now (its `gh` preflight and turbo-cache
// log are explicit calls, not import-time side effects); keeping the
// classification pure is what lets it get REAL tests.

/**
 * The marker label. It must NOT start with `sc:` — that prefix is the
 * model-override control vocabulary (sandcastle-model-overrides.mts), and an
 * unknown role under it is a hard error that aborts the run before any sandbox
 * starts. Marking an issue would then break the next invocation.
 */
export const NOOP_LABEL = 'sandcastle:no-op';

/** Colour/description used when the label is created on first use. */
export const NOOP_LABEL_COLOR = 'ededed';
export const NOOP_LABEL_DESCRIPTION =
  'Sandcastle ran this issue and produced no changes — needs a human decision';

export type PipelineOutcome<T> = {
  issue: T;
  /** Whether the per-issue pipeline resolved or threw. */
  status: 'fulfilled' | 'rejected';
  /** Commits the implementer + reviewer reported for this run. */
  commitCount: number;
  /** Whether the branch is ahead of the base branch right now. */
  branchAhead: boolean;
};

export type PartitionedOutcomes<T> = {
  /** Has work to land — goes to the merge phase. */
  completed: T[];
  /** Ran cleanly and produced nothing — gets marked and excluded from re-planning. */
  noop: T[];
  /** Threw — stays eligible, and its branch is kept out of the rescue path. */
  failed: T[];
};

/**
 * Split one iteration's pipeline results into the three outcomes.
 *
 * The two non-obvious rules:
 *
 * - **0 commits but the branch is ahead** is `completed`, not `noop`. That is
 *   the idempotent re-run: a previous iteration committed the work and this
 *   one correctly did nothing, but the branch still has to reach the merger.
 * - **A rejected pipeline is never `noop`**, whatever its commit count. A crash
 *   also produces no commits, and marking it handled would retire an issue that
 *   was never successfully attempted. It is not `completed` either even when the
 *   branch is ahead — a branch left behind by a pipeline that threw must not
 *   merge in the same run it failed, or the build gate becomes advisory-only.
 */
export function partitionOutcomes<T>(
  outcomes: readonly PipelineOutcome<T>[],
): PartitionedOutcomes<T> {
  const completed: T[] = [];
  const noop: T[] = [];
  const failed: T[] = [];

  for (const outcome of outcomes) {
    if (outcome.status === 'rejected') {
      failed.push(outcome.issue);
    } else if (outcome.commitCount > 0 || outcome.branchAhead) {
      completed.push(outcome.issue);
    } else {
      noop.push(outcome.issue);
    }
  }

  return { completed, noop, failed };
}

/** Whether an issue's labels carry the no-op marker. */
export function hasNoOpLabel(labels: readonly string[]): boolean {
  return labels.includes(NOOP_LABEL);
}

/**
 * The comment left on a no-op issue. It has to answer, for a human skimming
 * the issue later: what ran, what it found, why the issue is still open, and
 * how to put it back in the queue.
 */
export function noOpIssueComment({
  id,
  branch,
  iteration,
}: {
  id: string;
  branch: string;
  iteration: number;
}): string {
  return [
    `**Sandcastle: no changes produced** (iteration ${iteration})`,
    '',
    `The implementer signalled completion on \`${branch}\` with no commits, and ` +
      `the branch is not ahead of the base branch — there is nothing for the ` +
      `merge phase to land.`,
    '',
    `This issue is **left open** on purpose. A run that produces nothing can mean ` +
      `the work was already done, or that the agent misread the task; deciding ` +
      `between those is a human call.`,
    '',
    `It is labelled \`${NOOP_LABEL}\` and skipped for the rest of this run so the ` +
      `orchestrator does not re-plan it every iteration. To make it eligible again:`,
    '',
    '```bash',
    `gh issue edit ${id} --remove-label "${NOOP_LABEL}"`,
    '```',
  ].join('\n');
}
