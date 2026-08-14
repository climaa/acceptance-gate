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
// "Produced nothing" has two shapes, and the second one is the same bug one
// layer up: an implementer that commits an approach and then reverts it leaves
// a branch that is AHEAD of base and still carries nothing to land. Every
// commit-counting check reads that as work, so it was filed as completed, sent
// to a merger with nothing to merge, and then re-found by the stranded-branch
// rescue every iteration until MAX_ITERATIONS. Both shapes get the same
// terminal treatment here; only the wording differs (NoOpReason).
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
  /**
   * Whether the branch's NET diff against the base branch is empty — commits
   * that cancel out (an approach implemented and then reverted) leave a branch
   * that is ahead of base and still has nothing to land.
   *
   * Required, and `false` is the value for "could not be determined": the
   * caller collapses a failed or absent git probe into it, because this field
   * is what durably retires an issue and an unreadable diff is not evidence of
   * an empty one.
   */
  diffEmpty: boolean;
};

/** Why an outcome produced nothing to land. Selects the comment's wording. */
export type NoOpReason =
  /** The implementer committed nothing and the branch is not ahead of base. */
  | 'no-commits'
  /** Commits exist, but they cancel out: the net diff against base is empty. */
  | 'empty-diff';

export type NoOpOutcome<T> = { issue: T; reason: NoOpReason };

export type PartitionedOutcomes<T> = {
  /** Has work to land — goes to the merge phase. */
  completed: T[];
  /**
   * Produced nothing to land — gets marked and excluded from re-planning. Each
   * entry carries WHY, because the two reasons need different wording for the
   * human who reads the issue afterwards.
   */
  noop: NoOpOutcome<T>[];
  /** Threw — stays eligible, and its branch is kept out of the rescue path. */
  failed: T[];
};

/**
 * Split one iteration's pipeline results into the three outcomes.
 *
 * The three non-obvious rules:
 *
 * - **0 commits but the branch is ahead** is `completed`, not `noop`. That is
 *   the idempotent re-run: a previous iteration committed the work and this
 *   one correctly did nothing, but the branch still has to reach the merger.
 * - **Commits whose net diff is empty** are `noop`, not `completed`. An
 *   add-then-revert pair is ahead of base by every commit-counting measure and
 *   carries nothing to merge; filed as completed it reaches a merger with
 *   nothing to merge and comes back as a stranded branch every iteration after,
 *   since no PR is ever opened for an empty diff to exclude it.
 * - **A rejected pipeline is never `noop`**, whatever its commit count or diff.
 *   A crash also produces no commits, and marking it handled would retire an
 *   issue that was never successfully attempted. It is not `completed` either
 *   even when the branch is ahead — a branch left behind by a pipeline that
 *   threw must not merge in the same run it failed, or the build gate becomes
 *   advisory-only.
 */
export function partitionOutcomes<T>(
  outcomes: readonly PipelineOutcome<T>[],
): PartitionedOutcomes<T> {
  const completed: T[] = [];
  const noop: NoOpOutcome<T>[] = [];
  const failed: T[] = [];

  for (const outcome of outcomes) {
    const hasCommits = outcome.commitCount > 0 || outcome.branchAhead;
    if (outcome.status === 'rejected') {
      failed.push(outcome.issue);
    } else if (hasCommits && !outcome.diffEmpty) {
      completed.push(outcome.issue);
    } else {
      noop.push({
        issue: outcome.issue,
        reason: hasCommits ? 'empty-diff' : 'no-commits',
      });
    }
  }

  return { completed, noop, failed };
}

/** Whether an issue's labels carry the no-op marker. */
export function hasNoOpLabel(labels: readonly string[]): boolean {
  return labels.includes(NOOP_LABEL);
}

/** What the stranded-branch rescue path should do with one candidate branch. */
export type StrandedDisposition =
  /** Has content — build-verify it and hand it to the merger, as before. */
  | 'rescue'
  /** Nets to nothing and is unmarked — comment, label, and leave it behind. */
  | 'retire'
  /** Nets to nothing and is already marked — leave it behind, silently. */
  | 'already-retired';

/**
 * Decide what happens to a `sandcastle/*` branch found ahead of base outside
 * the current plan.
 *
 * `partitionOutcomes` above already retires an empty-diff branch on the
 * iteration that produced it, so one only reaches the rescue path when nothing
 * upstream got to mark it — an orchestrator killed mid-run, or a `gh` outage
 * during marking. Skipping it silently would therefore leave no record at all,
 * and nothing would ever try again; `retire` marks it here instead.
 *
 * The `already-retired` case is what stops the rescue path from posting one
 * more near-identical comment per iteration on an issue it has already marked.
 * The marker is not a ban: a branch that has since gained real content is
 * rescued regardless of its labels.
 */
export function strandedDisposition(input: {
  diffEmpty: boolean;
  labels: readonly string[];
}): StrandedDisposition {
  if (!input.diffEmpty) return 'rescue';
  return hasNoOpLabel(input.labels) ? 'already-retired' : 'retire';
}

// The parts of the comment that depend on WHY nothing landed: the headline,
// what the run actually did, and what the human is being asked to judge.
// Everything else (the label, how to re-queue) is identical for both, so it
// stays in the template below rather than being written twice.
const NO_OP_WORDING: Record<
  NoOpReason,
  { headline: string; finding: (branch: string) => string; decision: string }
> = {
  'no-commits': {
    headline: 'no changes produced',
    finding: (branch) =>
      `The implementer signalled completion on \`${branch}\` with no commits, and ` +
      `the branch is not ahead of the base branch — there is nothing for the ` +
      `merge phase to land.`,
    decision:
      `A run that produces nothing can mean the work was already done, or that ` +
      `the agent misread the task; deciding between those is a human call.`,
  },
  'empty-diff': {
    headline: 'no net changes produced',
    finding: (branch) =>
      `\`${branch}\` has commits ahead of the base branch, but they cancel out: ` +
      `its net diff against base is empty. Something was implemented and then ` +
      `reverted (or the same change reached base another way), so there is ` +
      `nothing for the merge phase to land.`,
    decision:
      `A real attempt was made and undone — read the branch's commits before ` +
      `re-queuing, since re-running the issue as written will most likely ` +
      `reproduce the same dead end. Whether the issue itself still stands is a ` +
      `human call.`,
  },
};

/**
 * The comment left on a no-op issue. It has to answer, for a human skimming
 * the issue later: what ran, what it found, why the issue is still open, and
 * how to put it back in the queue.
 */
export function noOpIssueComment({
  id,
  branch,
  iteration,
  reason,
}: {
  id: string;
  branch: string;
  iteration: number;
  reason: NoOpReason;
}): string {
  const wording = NO_OP_WORDING[reason];
  return [
    `**Sandcastle: ${wording.headline}** (iteration ${iteration})`,
    '',
    wording.finding(branch),
    '',
    `This issue is **left open** on purpose. ${wording.decision}`,
    '',
    `It is labelled \`${NOOP_LABEL}\` and skipped for the rest of this run so the ` +
      `orchestrator does not re-plan it every iteration. To make it eligible again:`,
    '',
    '```bash',
    `gh issue edit ${id} --remove-label "${NOOP_LABEL}"`,
    '```',
  ].join('\n');
}
