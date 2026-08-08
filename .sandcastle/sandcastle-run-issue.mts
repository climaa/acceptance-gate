// Phase 2: Execute + Review — for one issue, creates a sandbox via
// createSandbox() so the implementer and reviewer share the same sandbox
// instance on the same branch. The implementer runs first; if it produces
// commits, build-verify then the reviewer run in the same sandbox.
import { createWorktreeSandbox } from "./sandcastle-worktree-sandbox.mts";
import { agentFor } from "./sandcastle-agent-profiles.mts";
import {
  type TurboStats,
  formatMs,
  isDocsOnlyDiff,
  runBuildVerify,
} from "./sandcastle-build-verify.mts";
import { type IssueRef, branchHasCommitsAhead } from "./sandcastle-git.mts";
import {
  formatIssueSummary,
  mergeCommitLists,
  shouldReview,
} from "./sandcastle-issue-pipeline.mts";

type BuildOutcome = { skipped: boolean; ms: number; statsStr: string };

/**
 * Catch build/TypeScript breaks before the PR is opened. Throws on failure so
 * the caller's pipeline is recorded as failed — which is also what keeps the
 * branch out of the stranded rescue this iteration (see queuedBranchesFor).
 *
 * Lifted out of runIssue() so the sandbox round-trips there stay legible; the
 * `sandbox` type is inferred from createWorktreeSandbox because
 * @ai-hero/sandcastle@0.12.0 exports no standalone Sandbox type.
 */
async function verifyBuild(
  sandbox: Awaited<ReturnType<typeof createWorktreeSandbox>>,
  issue: IssueRef,
): Promise<BuildOutcome> {
  if (isDocsOnlyDiff(issue.branch)) {
    console.log(`[build-verify] #${issue.id}: skipped (docs-only diff)`);
    return { skipped: true, ms: 0, statsStr: "" };
  }

  const buildStart = Date.now();
  console.log(`[build-verify] #${issue.id}: running pnpm build …`);
  let buildStdout = "";
  let buildStats: TurboStats | null = null;
  let buildFailed = false;

  try {
    const buildResult = await runBuildVerify(sandbox, issue.id);
    buildStdout = buildResult.stdout;
    buildStats = buildResult.stats;
    buildFailed = !buildResult.passed;
  } catch (err) {
    buildStdout = `Build error: ${(err as Error).message}`;
    buildFailed = true;
  }

  const ms = Date.now() - buildStart;
  const statsStr = buildStats
    ? ` (${buildStats.cached}/${buildStats.total} cached)`
    : "";

  if (buildFailed) {
    const tail = buildStdout.split("\n").slice(-50).join("\n");
    throw new Error(
      `[build-verify] pnpm build FAILED for #${issue.id} in ${formatMs(ms)}${statsStr}\n` +
        `--- last 50 lines ---\n${tail}\n` +
        `Hint: full log at .sandcastle/logs/build-verify-${issue.id}.log`,
    );
  }

  console.log(
    `[build-verify] #${issue.id}: passed in ${formatMs(ms)}${statsStr}`,
  );
  return { skipped: false, ms, statsStr };
}

export async function runIssue(issue: IssueRef, abortSignal: AbortSignal) {
  // Graceful-shutdown guard. createSandbox() takes no
  // AbortSignal in @ai-hero/sandcastle@0.12.0, so we gate the call site: on
  // abort, don't start a new per-issue sandbox. An in-flight issue below
  // still runs its `finally { sandbox.close() }`; this only stops new work.
  abortSignal.throwIfAborted();

  const sandbox = await createWorktreeSandbox(issue.branch);

  try {
    // Run the implementer. If it throws (e.g. AgentIdleTimeoutError) but the
    // branch already has commits ahead of main, the work was done but the
    // completion signal was never emitted — salvage by proceeding to review
    // instead of discarding the committed work.
    const implementStart = Date.now();
    const implement = await sandbox
      .run({
        name: "implementer",
        maxIterations: 100,
        completionSignal: "<promise>COMPLETE</promise>",
        idleTimeoutSeconds: 1200,
        signal: abortSignal,
        agent: agentFor("implementer", issue.overrides?.implementer),
        promptFile: "./.sandcastle/agent-docs/implement-prompt.md",
        promptArgs: {
          TASK_ID: issue.id,
          ISSUE_TITLE: issue.title,
          BRANCH: issue.branch,
        },
      })
      .catch((err: unknown) => {
        if (!branchHasCommitsAhead(issue.branch)) throw err;
        console.warn(
          `  ⚠ implementer for ${issue.branch} did not signal completion ` +
            `(${(err as Error).message}); branch has commits ahead of main — salvaging work.`,
        );
        return null; // null signals the salvage path; reviewer runs with 0 implement commits
      });
    const implementMs = Date.now() - implementStart;

    // Review if the branch has commits ahead of base — either from this
    // run, a salvaged idle-timeout run (implement === null), or a prior run.
    // Without this, an idempotent implementer that sees the work is already
    // done returns 0 commits and the merge phase is skipped forever.
    if (
      shouldReview({
        salvaged: implement === null,
        implementCommitCount: implement?.commits.length ?? 0,
        branchAhead: branchHasCommitsAhead(issue.branch),
      })
    ) {
      const build = await verifyBuild(sandbox, issue);

      const reviewStart = Date.now();
      const review = await sandbox.run({
        name: "reviewer",
        maxIterations: 1,
        completionSignal: "<promise>COMPLETE</promise>",
        idleTimeoutSeconds: 1200,
        signal: abortSignal,
        agent: agentFor("reviewer", issue.overrides?.reviewer),
        promptFile: "./.sandcastle/agent-docs/review-prompt.md",
        promptArgs: {
          BRANCH: issue.branch,
          TASK_ID: issue.id,
          ISSUE_TITLE: issue.title,
        },
      });
      const reviewMs = Date.now() - reviewStart;

      console.log(
        formatIssueSummary({
          id: issue.id,
          implement: formatMs(implementMs),
          build: build.skipped
            ? "build skipped"
            : `build ${formatMs(build.ms)}${build.statsStr}`,
          review: formatMs(reviewMs),
        }),
      );

      // Merge commits from both runs so the merge phase sees all of them.
      // implement is null in the salvage path (idled without signal).
      return {
        ...review,
        commits: mergeCommitLists(implement?.commits, review.commits),
      };
    }

    // implement is non-null here (salvage path always enters the if above).
    return implement!;
  } finally {
    await sandbox.close();
  }
}
