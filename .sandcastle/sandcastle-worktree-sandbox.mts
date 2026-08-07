// Shared worktree-sandbox creation. The per-issue pipeline
// (sandcastle-run-issue.mts) and the stranded-branch rescue path
// (sandcastle-stranded-branches.mts) both fork a fresh git worktree sandbox
// for a branch off `origin/${BASE_BRANCH}`, with identical pre-flight
// hygiene, retry, and docker/hook config — centralized here so the two
// cannot drift apart.
import { execSync } from "node:child_process";
import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { BASE_BRANCH, turboToken, turboTeam } from "./sandcastle-config.mts";
import { worktreeHooks } from "./sandcastle-sandbox-hooks.mts";
import { withRetry } from "./sandcastle-lifecycle.mts";

/**
 * baseBranch is ignored by createSandbox() when `branch` already exists (the
 * case for a rescued branch) — the sandbox then checks out those existing
 * commits instead of forking a new branch.
 */
export async function createWorktreeSandbox(branch: string) {
  // Ensure the base branch is up to date so the worktree forks from the
  // correct tip regardless of what branch the host is currently on.
  execSync(`git fetch origin ${BASE_BRANCH}`, { stdio: "inherit" });

  // Drop stale .git/worktrees/<name>/ metadata from prior aborted iterations.
  // Without this, git commands in the worktree path fail with "not a git
  // repository" when the directory no longer exists — exit 128 that surfaces
  // as a SandboxLifecycle FiberFailure (stale bind-mount git view).
  execSync("git worktree prune", { stdio: "inherit" });

  return withRetry(() =>
    sandcastle.createSandbox({
      branch,
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
}
