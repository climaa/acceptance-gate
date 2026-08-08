// Phase 3: Merge — a single agent opens a PR per completed branch, enables
// squash auto-merge, waits for each PR to merge via CI, then closes (or
// comments on) issues.
import { execSync } from 'node:child_process';
import * as sandcastle from '@ai-hero/sandcastle';
import { docker } from '@ai-hero/sandcastle/sandboxes/docker';
import { BASE_BRANCH } from './sandcastle-config.mts';
import { headHooks } from './sandcastle-sandbox-hooks.mts';
import { agentFor } from './sandcastle-agent-profiles.mts';
import { formatBranchLine } from './sandcastle-merge-branch-line.mts';
import type { IssueRef } from './sandcastle-git.mts';

function currentBranch(): string | null {
  try {
    return (
      execSync('git rev-parse --abbrev-ref HEAD', {
        encoding: 'utf8',
      }).trim() || null
    );
  } catch {
    return null;
  }
}

// Put the host checkout back on the branch the run started on (worktree-reaper hardening).
//
// The merger sandbox BIND-MOUNTS the host checkout, and merge-prompt.md tells
// the agent to `git checkout <branch>` first (later steps read `HEAD` — the PR
// diff and `gh pr create --head`). That checkout therefore lands on the host and
// outlives the run: afterwards the developer's main checkout sits on a feature
// branch, every later command silently operates on it, and the branch cannot
// be deleted because it is "used by worktree".
//
// `git checkout` never discards work: it carries non-conflicting local changes
// across, and refuses outright when the switch would overwrite them. So the
// failure path here is a warning telling the developer where they are, never
// data loss — which is also why this must NOT be a `checkout --force`.
function restoreHostBranch(startingBranch: string): void {
  const now = currentBranch();
  if (now === null || now === startingBranch) return;
  try {
    execSync(`git checkout ${startingBranch}`, { stdio: 'pipe' });
    console.log(
      `  🔙 restored host checkout to ${startingBranch} (merger left it on ${now})`,
    );
  } catch (err) {
    console.warn(
      `  ⚠ host checkout is on ${now}, could not restore ${startingBranch}: ` +
        `${(err as Error).message}. Run \`git checkout ${startingBranch}\` before continuing.`,
    );
  }
}

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
      // headHooks, NOT worktreeHooks — no startup `pnpm install`, because of
      // the bind mount described just below. merge-prompt.md already forbids
      // the AGENT a bare install here; this is the orchestrator holding itself
      // to the same rule. See sandcastle-sandbox-hooks.mts.
      hooks: headHooks,
      // HEAD-mode sandbox: bind-mounts the host checkout at /home/agent/workspace,
      // so any in-container pnpm run touches the host's node_modules. Belt-and-braces
      // env guard suppresses pnpm 11's automatic pre-run deps verification (which
      // would auto-`pnpm install` and ping-pong host↔container pnpm state — a known host↔container ping-pong,
      // a prior production fix). Must be the `pnpm_config_` prefix: `npm_config_verify_deps_before_run`
      // does NOT suppress pnpm 11's verify; `pnpm_config_verify_deps_before_run=false`
      // does. Covers agents operating before/without the pnpm-workspace.yaml setting.
      sandbox: docker({ env: { pnpm_config_verify_deps_before_run: 'false' } }),
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
