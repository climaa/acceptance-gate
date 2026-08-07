// Phase 2: Execute + Review — for one issue, creates a sandbox via
// createSandbox() so the implementer and reviewer share the same sandbox
// instance on the same branch. The implementer runs first; if it produces
// commits, build-verify then the reviewer run in the same sandbox.
import { execSync } from "node:child_process";
import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { BASE_BRANCH, turboToken, turboTeam } from "./sandcastle-config.mts";
import { worktreeHooks } from "./sandcastle-sandbox-hooks.mts";
import { agentFor } from "./sandcastle-agent-profiles.mts";
import { withRetry } from "./sandcastle-lifecycle.mts";
import {
  type TurboStats,
  formatMs,
  isDocsOnlyDiff,
  runBuildVerify,
} from "./sandcastle-build-verify.mts";
import { type IssueRef, branchHasCommitsAhead } from "./sandcastle-git.mts";

export async function runIssue(issue: IssueRef, abortSignal: AbortSignal) {
  // Graceful-shutdown guard. createSandbox() takes no
  // AbortSignal in @ai-hero/sandcastle@0.10.0, so we gate the call site: on
  // abort, don't start a new per-issue sandbox. An in-flight issue below
  // still runs its `finally { sandbox.close() }`; this only stops new work.
  abortSignal.throwIfAborted();

  // Ensure origin/main is up to date so the worktree forks from the
  // correct tip regardless of what branch the host is currently on.
  execSync(`git fetch origin ${BASE_BRANCH}`, { stdio: "inherit" });

  // Drop stale .git/worktrees/<name>/ metadata from prior aborted iterations.
  // Without this, git commands in the worktree path fail with "not a git
  // repository" when the directory no longer exists — exit 128 that surfaces
  // as a SandboxLifecycle FiberFailure (stale bind-mount git view).
  execSync("git worktree prune", { stdio: "inherit" });

  const sandbox = await withRetry(() =>
    sandcastle.createSandbox({
      branch: issue.branch,
      baseBranch: `origin/${BASE_BRANCH}`,
      sandbox: docker({
        containerUid: process.getuid?.() ?? 1000,
        containerGid: process.getgid?.() ?? 1000,
        ...(turboToken && turboTeam
          ? { env: { TURBO_TOKEN: turboToken, TURBO_TEAM: turboTeam } }
          : {}),
      }),
      // worktreeHooks: this mount is a fresh worktree under
      // .sandcastle/worktrees/ with no node_modules of its own, so the startup
      // `pnpm install` both belongs here and stays inside the worktree.
      hooks: worktreeHooks,
    }),
  );

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
      implement === null ||
      implement.commits.length > 0 ||
      branchHasCommitsAhead(issue.branch)
    ) {
      // Catch build/TypeScript breaks before the PR is opened; skip docs-only diffs.
      let buildMs = 0;
      let buildStats: TurboStats | null = null;
      let buildSkipped = false;
      let statsStr = "";

      if (isDocsOnlyDiff(issue.branch)) {
        console.log(`[build-verify] #${issue.id}: skipped (docs-only diff)`);
        buildSkipped = true;
      } else {
        const buildStart = Date.now();
        console.log(`[build-verify] #${issue.id}: running pnpm build …`);
        let buildStdout = "";
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

        buildMs = Date.now() - buildStart;
        statsStr = buildStats
          ? ` (${buildStats.cached}/${buildStats.total} cached)`
          : "";

        if (buildFailed) {
          const tail = buildStdout.split("\n").slice(-50).join("\n");
          throw new Error(
            `[build-verify] pnpm build FAILED for #${issue.id} in ${formatMs(buildMs)}${statsStr}\n` +
              `--- last 50 lines ---\n${tail}\n` +
              `Hint: full log at .sandcastle/logs/build-verify-${issue.id}.log`,
          );
        }

        console.log(
          `[build-verify] #${issue.id}: passed in ${formatMs(buildMs)}${statsStr}`,
        );
      }

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

      const buildPart = buildSkipped
        ? "build skipped"
        : `build ${formatMs(buildMs)}${statsStr}`;
      console.log(
        `[summary] issue #${issue.id}: implement ${formatMs(implementMs)} | ${buildPart} | review ${formatMs(reviewMs)}`,
      );

      // Merge commits from both runs so the merge phase sees all of them.
      // implement is null in the salvage path (idled without signal).
      return {
        ...review,
        commits: [...(implement?.commits ?? []), ...review.commits],
      };
    }

    // implement is non-null here (salvage path always enters the if above).
    return implement!;
  } finally {
    await sandbox.close();
  }
}
