// Pure git/gh CLI query helpers — branch/worktree/issue lookups used by the
// stranded-branch rescue path and the per-issue implement→review pipeline.
import { execSync } from "node:child_process";
import { BASE_BRANCH } from "./sandcastle-config.mts";
import {
  type Dirtiness,
  worktreeReapBlocker,
} from "./sandcastle-worktree-safety.mts";
import type {
  PerIssueRole,
  ProfileOverride,
} from "./sandcastle-model-overrides.mts";

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

export function branchHasCommitsAhead(branch: string): boolean {
  try {
    const out = execSync(
      `git rev-list --count origin/${BASE_BRANCH}..${branch} 2>/dev/null`,
      { encoding: "utf8" },
    ).trim();
    return Number(out) > 0;
  } catch {
    // Branch doesn't exist yet (first run) — nothing to merge.
    return false;
  }
}

export function listSandcastleBranches(): string[] {
  try {
    const out = execSync(
      `git for-each-ref --format='%(refname:short)' refs/heads/sandcastle/`,
      { encoding: "utf8" },
    );
    return out
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function parseIssueIdFromBranch(branch: string): string | null {
  // Format from agent-docs/plan-prompt.md → `sandcastle/issue-{id}-{slug}`
  const m = branch.match(/^sandcastle\/issue-(\d+)-/);
  return m ? m[1]! : null;
}

// `labels` is what carries the per-issue model overrides (`sc:…`). It is
// fetched here, deterministically, rather than being threaded through the
// planner's <plan> JSON: a mechanism that decides cost and capability must not
// depend on an agent faithfully echoing strings, and the stranded-rescue path
// builds IssueRefs without the planner at all.
export function fetchIssue(
  id: string,
): { title: string; state: string; labels: string[] } | null {
  try {
    const out = execSync(`gh issue view ${id} --json title,state,labels`, {
      encoding: "utf8",
    }).trim();
    const parsed = JSON.parse(out) as {
      title?: string;
      state?: string;
      labels?: { name?: string }[];
    };
    if (!parsed.title || !parsed.state) return null;
    const labels = (parsed.labels ?? [])
      .map((l) => l?.name)
      .filter((n): n is string => Boolean(n));
    return { title: parsed.title, state: parsed.state, labels };
  } catch {
    return null;
  }
}

export function branchHasOpenPr(branch: string): boolean {
  try {
    const out = execSync(
      `gh pr list --head ${branch} --state open --json number --jq 'length'`,
      { encoding: "utf8" },
    ).trim();
    return Number(out) > 0;
  } catch {
    return false;
  }
}

// The primary repository checkout. `git worktree list --porcelain` always
// reports it FIRST — that ordering is the documented contract and is what
// makes this cheap to identify (issue #1911).
export function primaryWorktreePath(): string | null {
  try {
    const out = execSync("git worktree list --porcelain", {
      encoding: "utf8",
    });
    for (const line of out.split("\n")) {
      if (line.startsWith("worktree ")) {
        return line.slice("worktree ".length).trim() || null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Working-tree state of `worktreePath`. Fails CLOSED: a missing or broken
// checkout reports "unreadable", which blocks the reap just as "dirty" does —
// but says so accurately in the log rather than claiming uncommitted work.
// git's own stderr is swallowed so a missing path does not print a bare
// `fatal:` line above our explanation.
export function worktreeDirtiness(worktreePath: string): Dirtiness {
  try {
    const out = execSync(`git -C "${worktreePath}" status --porcelain`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim().length > 0 ? "dirty" : "clean";
  } catch {
    return "unreadable";
  }
}

// Reason to SKIP removing `worktreePath`, or null when it is safe to reap.
// Thin IO wrapper: the rules themselves are pure and unit-tested in
// sandcastle-worktree-safety.mts.
export function worktreeReapBlockerFor(worktreePath: string): string | null {
  return worktreeReapBlocker({
    worktreePath,
    primaryPath: primaryWorktreePath(),
    dirtiness: worktreeDirtiness(worktreePath),
  });
}

// Returns the filesystem path of the worktree that has `branch` checked out,
// or null if the branch is not registered as a worktree.
export function findWorktreeForBranch(branch: string): string | null {
  try {
    const out = execSync("git worktree list --porcelain", {
      encoding: "utf8",
    });
    let currentPath: string | null = null;
    for (const line of out.split("\n")) {
      if (line.startsWith("worktree ")) {
        currentPath = line.slice("worktree ".length).trim();
      } else if (line.startsWith("branch refs/heads/")) {
        const worktreeBranch = line.slice("branch refs/heads/".length).trim();
        if (worktreeBranch === branch && currentPath !== null) {
          return currentPath;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}
