// Phase 3: Merge — a single agent opens a PR per completed branch, enables
// squash auto-merge, waits for each PR to merge via CI, then closes (or
// comments on) issues.
import * as sandcastle from '@ai-hero/sandcastle';
import { BASE_BRANCH } from './sandcastle-config.mts';
import { headSandboxOptions } from './sandcastle-sandbox-hooks.mts';
import { agentFor } from './sandcastle-agent-profiles.mts';
import { formatBranchLine } from './sandcastle-merge-branch-line.mts';
import { type IssueRef, currentBranch, restoreHostBranch } from './sandcastle-git.mts';

// Called both from the empty-plan rescue path and from the end-of-iteration
// merge phase, so the prompt args are uniform.
//
// idleTimeoutSeconds: 1800 — the auto-merge poll loop runs 30 s × 40 = 20 min
// max; the SDK's default 600 s idle timer kills the run mid-poll if no output
// is emitted between iterations (a mid-run crash fix from production).
export async function runMerger(
  branches: IssueRef[],
  abortSignal: AbortSignal,
): Promise<void> {
  // Captured BEFORE the run and restored in `finally`, so an abort, a crash or
  // a timeout cannot strand the host checkout on a feature branch either.
  const startingBranch = currentBranch() ?? BASE_BRANCH;
  try {
    await sandcastle.run({
      // HEAD-mode: bind-mounts the host checkout, so no startup install (see
      // headSandboxOptions in sandcastle-sandbox-hooks.mts). merge-prompt.md
      // already forbids the AGENT a bare install here; this holds the
      // orchestrator to the same rule.
      ...headSandboxOptions(),
      name: 'merger',
      maxIterations: 1,
      completionSignal: '<promise>COMPLETE</promise>',
      idleTimeoutSeconds: 1800,
      signal: abortSignal,
      agent: agentFor('merger'),
      promptFile: './.sandcastle/agent-docs/merge-prompt.md',
      promptArgs: {
        BRANCHES_WITH_ISSUES: branches.map(formatBranchLine).join('\n'),
      },
    });
  } finally {
    restoreHostBranch(startingBranch);
  }
}
