// Pure formatting for one `BRANCHES_WITH_ISSUES` line in the merge prompt.
// Split out of sandcastle-merge.mts so the implementer/reviewer attribution
// can be unit-tested directly: sandcastle-merge.mts also imports
// sandcastle-config.mts (transitively, via sandcastle-sandbox-hooks.mts's
// caller), which has import-time side effects (gh preflight, turbo-cache
// log), so nothing that pulls it in can be loaded in a test. Same reasoning
// as sandcastle-sandbox-hooks.mts and sandcastle-model-overrides.mts.
//
// Resolution is host-side and deterministic — consistent with the existing
// principle that routing data is never delegated to an agent echoing strings
// back (see the comment above `fetchIssue` in sandcastle-git.mts). The merger
// agent only ever copies the already-resolved implementer/reviewer values
// verbatim from this line into the PR footer.
import { effectiveProfile } from "./sandcastle-agent-profiles.mts";
import type {
  Effort,
  PerIssueRole,
  ProfileOverride,
} from "./sandcastle-model-overrides.mts";

export type BranchLineIssue = {
  id: string;
  title: string;
  branch: string;
  overrides?: Partial<Record<PerIssueRole, ProfileOverride>>;
};

/** "claude-sonnet-5·low", or the bare model name when effort is unset — the model·effort half of describeOverride's format, without its role= prefix. */
export function formatProfile(profile: { model: string; effort?: Effort }): string {
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
