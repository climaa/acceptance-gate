// The issue reference threaded through the orchestrator: a planned (or
// stranded-rescued) issue and the branch it lives on.
//
// Its own type-only module so sandcastle-git.mts (which re-exports it, keeping
// its importers unchanged) and sandcastle-merge-branch-line.mts share ONE
// definition. The latter used to keep a structural copy (`BranchLineIssue`) to
// avoid importing from git.mts — but a `type` import is erased at compile time
// and carries no runtime coupling, so one shared type is strictly better than
// two that can silently drift.
import type { PerIssueRole, ProfileOverride } from './sandcastle-model-overrides.mts';

export type IssueRef = {
  id: string;
  title: string;
  branch: string;
  /**
   * Per-issue agent overrides resolved from the issue's `sc:` labels
   * (sandcastle-model-overrides.mts). Absent means "use PROFILES/env" — the
   * overwhelmingly common case. Attached at both IssueRef construction sites:
   * main.mts (planner output) and sandcastle-stranded-branches.mts (rescue).
   */
  overrides?: Partial<Record<PerIssueRole, ProfileOverride>>;
};
