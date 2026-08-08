// Stranded-branch rescue — finds sandcastle/* branches with commits ahead of
// BASE_BRANCH that weren't part of the current plan (typically because a
// prior merge phase crashed or was interrupted), build-verifies them, and
// hands back only the ones safe to merge.
import { execSync } from 'node:child_process';
import { createWorktreeSandbox } from './sandcastle-worktree-sandbox.mts';
import { parseOverrideLabels } from './sandcastle-model-overrides.mts';
import { isDocsOnlyDiff, runBuildVerify } from './sandcastle-build-verify.mts';
import {
  type IssueRef,
  branchHasCommitsAhead,
  branchHasOpenPr,
  fetchIssue,
  findWorktreeForBranch,
  listSandcastleBranches,
  parseIssueIdFromBranch,
  worktreeReapBlockerFor,
} from './sandcastle-git.mts';

// Find sandcastle/* branches that are ahead of BASE_BRANCH but not in
// `alreadyQueued`. These are typically branches whose prior merge phase
// crashed or was interrupted — without rescuing them here they would
// stay stranded forever, because the planner intentionally excludes
// already-implemented branches from each iteration's plan.
//
// We also skip branches whose issue is CLOSED (the work likely landed
// via another path and the local branch is stale) or that already have
// an open PR (the merger will pick it up on its own).
// Clean up a branch whose issue is CLOSED: delete the stale local branch, and
// the worktree holding it first if one exists — because git refuses `branch -D`
// on a checked-out branch. The worktree is removed ONLY when the reaper's safety
// rules pass (worktreeReapBlockerFor); a blocked worktree means the branch can't
// be deleted anyway ("used by worktree"), so we return early and skip the
// `git branch -D` to avoid a confusing double-warning. Extracted so
// collectStrandedIssues stays a shallow filter loop.
function reapClosedIssueBranch(branch: string, id: string, state: string): void {
  const worktreePath = findWorktreeForBranch(branch);
  if (worktreePath) {
    const blocker = worktreeReapBlockerFor(worktreePath);
    if (blocker) {
      console.warn(
        `  ⚠ refusing to remove worktree ${worktreePath}: ${blocker}. ` +
          `Leaving branch ${branch} (issue #${id} is ${state}) in place.`,
      );
      return;
    }
    try {
      execSync(`git worktree remove --force "${worktreePath}"`, { stdio: 'pipe' });
      console.log(
        `  🧹 removed stale worktree ${worktreePath} (issue #${id} is ${state})`,
      );
    } catch (err) {
      console.warn(
        `  ⚠ could not remove worktree ${worktreePath}: ${(err as Error).message}`,
      );
    }
  }
  try {
    execSync(`git branch -D ${branch}`, { stdio: 'pipe' });
    console.log(`  🧹 deleted stale local branch ${branch} (issue #${id} is ${state})`);
  } catch (err) {
    console.warn(
      `  ⚠ could not delete stale branch ${branch} (issue #${id} ${state}): ${(err as Error).message}`,
    );
  }
}

export function collectStrandedIssues(alreadyQueued: Set<string>): IssueRef[] {
  const stranded: IssueRef[] = [];
  for (const branch of listSandcastleBranches()) {
    if (alreadyQueued.has(branch)) continue;
    if (!branchHasCommitsAhead(branch)) continue;
    const id = parseIssueIdFromBranch(branch);
    if (!id) {
      console.warn(`  ⚠ skipping stranded branch with unparseable name: ${branch}`);
      continue;
    }
    const issue = fetchIssue(id);
    if (!issue) {
      console.warn(`  ⚠ skipping stranded branch ${branch}: gh issue view ${id} failed`);
      continue;
    }
    if (issue.state !== 'OPEN') {
      // Issue closed → the work already landed (squash-merge leaves orphan local
      // commits that still look "ahead"). Delete the stale local branch — and
      // the worktree holding it, if any and only when safe. See
      // reapClosedIssueBranch.
      reapClosedIssueBranch(branch, id, issue.state);
      continue;
    }
    if (branchHasOpenPr(branch)) {
      console.warn(`  ⚠ skipping stranded branch ${branch}: already has an open PR`);
      continue;
    }
    // Honour the same `sc:` model overrides on the rescue path — a rescued
    // branch still runs its reviewer. A malformed label is a warning here, not
    // a throw: refusing to rescue stranded work over a label typo would strand
    // it further. The default profile is used instead, and the warning says so.
    const { overrides, errors } = parseOverrideLabels(issue.labels);
    if (errors.length > 0) {
      console.warn(
        `  ⚠ #${id}: ignoring model override label(s), using defaults — ${errors.join('; ')}`,
      );
    }
    stranded.push({
      id,
      title: issue.title,
      branch,
      ...(errors.length === 0 && Object.keys(overrides).length > 0 ? { overrides } : {}),
    });
  }
  return stranded;
}

// Build-verify a rescued/stranded branch in its own throwaway sandbox before
// it reaches the merger (build-gate hardening). The rescue path picks up branches whose
// prior pipeline crashed or was interrupted — exactly the case where the
// branch's build state is unknown — so merging them blind made the build gate
// advisory-only. Returns true when the branch is safe to merge (build passed,
// or the diff is docs-only and the build is skipped); false on any build
// failure or sandbox error, in which case the caller skips the branch and it
// stays stranded for human attention rather than merging unverified.
async function buildVerifyRescuedBranch(
  ref: IssueRef,
  abortSignal: AbortSignal,
): Promise<boolean> {
  if (isDocsOnlyDiff(ref.branch)) {
    console.log(`[build-verify] rescued #${ref.id}: skipped (docs-only diff)`);
    return true;
  }

  // Graceful-shutdown guard. createSandbox() takes no AbortSignal
  // in @ai-hero/sandcastle@0.12.0, so we gate the call site instead: on abort,
  // don't spin up a new build-verify sandbox — this is "new work".
  abortSignal.throwIfAborted();

  let sandbox: Awaited<ReturnType<typeof createWorktreeSandbox>>;
  try {
    sandbox = await createWorktreeSandbox(ref.branch);
  } catch (err) {
    console.warn(
      `  ⚠ rescued branch ${ref.branch} (#${ref.id}): could not create sandbox ` +
        `for build-verify (${(err as Error).message}) — skipping (stays stranded).`,
    );
    return false;
  }

  try {
    console.log(`[build-verify] rescued #${ref.id}: running pnpm build …`);
    const buildResult = await runBuildVerify(sandbox, `rescued-${ref.id}`);
    if (!buildResult.passed) {
      const tail = buildResult.stdout.split('\n').slice(-50).join('\n');
      console.warn(
        `  ⚠ rescued branch ${ref.branch} (#${ref.id}) FAILED build-verify — ` +
          `skipping (stays stranded for human attention).\n` +
          `--- last 50 lines ---\n${tail}`,
      );
      return false;
    }
    console.log(`[build-verify] rescued #${ref.id}: passed`);
    return true;
  } catch (err) {
    console.warn(
      `  ⚠ rescued branch ${ref.branch} (#${ref.id}) build-verify errored ` +
        `(${(err as Error).message}) — skipping (stays stranded).`,
    );
    return false;
  } finally {
    await sandbox.close();
  }
}

// Build-verify every rescued branch and return only those safe to merge.
// Branches that fail stay stranded; the skipped count is logged here so both
// rescue call sites report it identically.
export async function verifyStrandedBranches(
  stranded: IssueRef[],
  abortSignal: AbortSignal,
): Promise<IssueRef[]> {
  const verified: IssueRef[] = [];
  for (const ref of stranded) {
    if (await buildVerifyRescuedBranch(ref, abortSignal)) verified.push(ref);
  }
  const skipped = stranded.length - verified.length;
  if (skipped > 0) {
    console.log(`  ${skipped} rescued branch(es) failed build-verify and stay stranded.`);
  }
  return verified;
}
