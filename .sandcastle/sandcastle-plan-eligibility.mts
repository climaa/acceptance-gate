// Pure policy for what the orchestrator does with a planned issue, extracted
// from main.mts.
//
// main.mts describes itself as "just the composition root: startup wiring plus
// the plan→execute→merge loop", but three decisions with real correctness
// consequences were living inline in it, none reachable from a test. These are
// two of them. Each has a documented failure mode behind it, which is exactly
// why they should not be one careless edit away from silently inverting.
//
// Imports only from side-effect-free siblings, so loading this drags in no IO.

import { hasNoOpLabel } from './sandcastle-noop-issues.mts';
import {
  type PerIssueRole,
  type ProfileOverride,
  parseOverrideLabels,
} from './sandcastle-model-overrides.mts';

export type PlannedOverrides = Partial<Record<PerIssueRole, ProfileOverride>>;

export type EligibilityVerdict =
  /** Already produced nothing once. Do not spend another sandbox on it. */
  | { kind: 'skip-noop' }
  /** A control label did not parse. Must abort, never fall back silently. */
  | { kind: 'reject'; errors: string[] }
  /** Run it, with any per-issue model overrides its labels resolved to. */
  | { kind: 'accept'; overrides: PlannedOverrides };

/**
 * Decide what to do with one issue the planner proposed, from its labels alone.
 *
 * Two independent guards, both evaluated BEFORE any sandbox is created:
 *
 *  - No-op exclusion. The planner is also told to skip these
 *    (agent-docs/plan-prompt.md), but a mechanism that stops a run burning
 *    MAX_ITERATIONS of sandboxes on one issue must not depend on an agent
 *    obeying a prompt. `seenNoOpIds` is the run-scoped half that still works
 *    when `gh` is unavailable; NOOP_LABEL is the durable half.
 *
 *  - Override parsing. A typo'd control label must surface as an error, never
 *    as a silent fallback to the expensive default — that would be an
 *    unnoticed cost and capability change.
 */
export function classifyPlannedIssue(input: {
  id: string;
  labels: string[];
  seenNoOpIds: ReadonlySet<string>;
}): EligibilityVerdict {
  if (input.seenNoOpIds.has(input.id) || hasNoOpLabel(input.labels)) {
    return { kind: 'skip-noop' };
  }
  const { overrides, errors } = parseOverrideLabels(input.labels);
  if (errors.length > 0) return { kind: 'reject', errors };
  return { kind: 'accept', overrides };
}

/**
 * Branches the stranded-branch rescue must NOT pick up this iteration.
 *
 * Completed branches are already queued for merge. Failed ones are the subtle
 * half and the reason this is a named function: a just-failed pipeline leaves a
 * branch that IS ahead of base with no PR, which is precisely the shape the
 * rescue path looks for. Let it through and the branch merges in the same run
 * its build failed — making the build gate advisory-only.
 */
export function queuedBranchesFor(
  completedBranches: readonly string[],
  failedBranches: readonly string[],
): Set<string> {
  return new Set([...completedBranches, ...failedBranches]);
}
