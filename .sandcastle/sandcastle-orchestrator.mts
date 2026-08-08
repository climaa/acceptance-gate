// Pure plan-handling logic lifted out of main.mts's loop so it can be tested
// without running the orchestrator.
//
// The loop itself stays in main.mts (the composition root) and threads the IO —
// the planner run, the per-issue `gh` label fetch, the sandboxes — around these
// two decisions. This is the first extraction toward making the loop testable;
// it imports only side-effect-free siblings, so it loads in a unit test.
import { parsePlan } from './sandcastle-plan-parse.mts';
import { classifyPlannedIssue } from './sandcastle-plan-eligibility.mts';
import type { IssueRef } from './sandcastle-issue-ref.mts';

/**
 * Pull the `<plan>…</plan>` block out of the planner agent's stdout and validate
 * it through parsePlan (the injection gate). Throws with the raw stdout when no
 * `<plan>` tag is present, so a planner that ignored the format fails loud
 * rather than silently planning nothing.
 */
export function parsePlanOutput(stdout: string): IssueRef[] {
  const match = stdout.match(/<plan>([\s\S]*?)<\/plan>/);
  if (!match) {
    throw new Error('Planning agent did not produce a <plan> tag.\n\n' + stdout);
  }
  return parsePlan(match[1]!);
}

export type ScreenedPlan = {
  /** Issues to run this iteration, each with any sc:* overrides attached. */
  eligible: IssueRef[];
  /** Ids classified no-op this pass — the caller records them and logs. */
  newlyNoOp: string[];
  /** Per-issue model-override label errors — the caller throws if non-empty. */
  overrideErrors: string[];
};

/**
 * Decide, from each planned issue's already-fetched labels, which issues are
 * eligible to run — dropping ones already marked no-op and collecting any
 * invalid sc:* override labels — BEFORE any sandbox is created. The label fetch
 * (IO) stays in the caller; this is the pure classification over the result, so
 * a run cannot burn a sandbox on an ineligible issue and a typo'd control label
 * is caught for free.
 *
 * `seenNoOpIds` is the run-scoped set of ids already found to do nothing; it is
 * read, never mutated (the caller adds `newlyNoOp` to it).
 */
export function screenPlan(
  entries: { issue: IssueRef; labels: string[] }[],
  seenNoOpIds: ReadonlySet<string>,
): ScreenedPlan {
  const eligible: IssueRef[] = [];
  const newlyNoOp: string[] = [];
  const overrideErrors: string[] = [];

  for (const { issue, labels } of entries) {
    const verdict = classifyPlannedIssue({ id: issue.id, labels, seenNoOpIds });
    if (verdict.kind === 'skip-noop') {
      newlyNoOp.push(issue.id);
      continue;
    }
    if (verdict.kind === 'reject') {
      overrideErrors.push(...verdict.errors.map((e) => `  #${issue.id}  ${e}`));
      continue;
    }
    if (Object.keys(verdict.overrides).length > 0) {
      issue.overrides = verdict.overrides;
    }
    eligible.push(issue);
  }

  return { eligible, newlyNoOp, overrideErrors };
}
