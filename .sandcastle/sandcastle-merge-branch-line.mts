// Pure formatting for one `BRANCHES_WITH_ISSUES` line in the merge prompt.
//
// Its own module rather than inline in sandcastle-merge.mts, which imports
// sandcastle-config.mts — that has import-time side effects (gh preflight,
// turbo-cache log), so anything pulling it in cannot be loaded in a test. Same
// reasoning as sandcastle-sandbox-hooks.mts and sandcastle-worktree-safety.mts.
//
// Resolving the profiles host-side keeps routing data out of an agent's hands,
// per the existing principle spelled out above `fetchIssue` in
// sandcastle-git.mts: the merger only ever copies the already-resolved
// implementer/reviewer values verbatim from this line into the PR footer.
import {
  type AgentProfile,
  effectiveProfile,
} from "./sandcastle-agent-profiles.mts";
import type {
  PerIssueRole,
  ProfileOverride,
} from "./sandcastle-model-overrides.mts";

/**
 * The part of `IssueRef` (sandcastle-git.mts) this formatter reads, restated
 * rather than imported: that module reaches sandcastle-config.mts too.
 */
export type BranchLineIssue = {
  id: string;
  title: string;
  branch: string;
  overrides?: Partial<Record<PerIssueRole, ProfileOverride>>;
};

/** "claude-sonnet-5·low", or the bare model when effort is unset — describeOverride's format without its `role=` prefix. */
export function formatProfile(profile: AgentProfile): string {
  return profile.effort ? `${profile.model}·${profile.effort}` : profile.model;
}

/** One `BRANCHES_WITH_ISSUES` line for the merge prompt, implementer/reviewer profiles resolved (PROFILES < env < issue label). */
export function formatBranchLine(issue: BranchLineIssue): string {
  const implementer = formatProfile(
    effectiveProfile("implementer", issue.overrides?.implementer),
  );
  const reviewer = formatProfile(
    effectiveProfile("reviewer", issue.overrides?.reviewer),
  );
  return (
    `- branch: ${issue.branch}, issue: ${issue.id}, title: ${issue.title}, ` +
    `implementer: ${implementer}, reviewer: ${reviewer}`
  );
}
