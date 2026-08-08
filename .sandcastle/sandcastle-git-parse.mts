// Pure parsers for the git/gh command output that sandcastle-git.mts collects.
//
// Same split sandcastle-worktree-safety.mts already established: the shelling
// out stays in sandcastle-git.mts as a thin IO wrapper, the decisions live here
// where they can be unit-tested against fixture strings. That module carried 11
// execSync calls — 42% of every side effect in .sandcastle/ — with no
// behavioral test on any of them, because there was nowhere to attach one.
//
// Imports nothing on purpose, so loading it drags in no side effects.

/** Working-tree state of a checkout. Mirrors sandcastle-worktree-safety.mts. */
export type WorktreeDirtiness = 'clean' | 'dirty' | 'unreadable';

export type ParsedIssue = {
  title: string;
  state: string;
  labels: string[];
};

/**
 * `git rev-list --count` / `gh pr list --jq length` both answer with a bare
 * integer. Anything else — empty output, whitespace, a git error that still
 * exited 0 — must read as "no", never as a truthy NaN.
 */
export function parsePositiveCount(stdout: string): boolean {
  const n = Number(stdout.trim());
  return Number.isFinite(n) && n > 0;
}

/**
 * `git for-each-ref --format='%(refname:short)'` — one ref per line.
 *
 * The single quotes in that format string are consumed by the shell execSync
 * spawns, so git receives a bare format and emits bare refs. Deliberately does
 * NOT strip quotes: doing so would be a behavior change smuggled into a
 * refactor, guarding a case that cannot occur, at the cost of corrupting any
 * ref legitimately containing a leading and trailing quote.
 */
export function parseBranchList(stdout: string): string[] {
  return stdout
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Issue id grammar: bare digits, length-capped. This is what the planner puts
 * in the `id` field and what the branch embeds. Capped so a pathological input
 * cannot produce an absurdly long id that some downstream `gh`/`git` call then
 * spends.
 */
export const ISSUE_ID_RE = /^\d{1,10}$/;

/**
 * Branch grammar, fixed by agent-docs/plan-prompt.md:
 * `sandcastle/issue-{id}-{slug}`, slug lowercase-hyphen only.
 *
 * ANCHORED at both ends and charset-constrained on purpose. The earlier form
 * `/^sandcastle\/issue-(\d+)-/` was prefix-only, so `sandcastle/issue-1-$(...)`
 * — a legal git branch name — passed it. That branch then flowed unescaped into
 * host `execSync` at every git/gh call site. This regex is the single source of
 * truth two callers rely on: parseIssueIdFromBranch (below, over real local
 * refs) and parsePlan (sandcastle-plan-parse.mts, over untrusted planner JSON).
 * Keep the slug charset free of every shell metacharacter — that property is the
 * whole point.
 */
export const SANDCASTLE_BRANCH_RE = /^sandcastle\/issue-(\d{1,10})-[a-z0-9-]+$/;

export function parseIssueIdFromBranch(branch: string): string | null {
  const m = branch.match(SANDCASTLE_BRANCH_RE);
  return m ? m[1]! : null;
}

/**
 * `gh issue view --json title,state,labels`.
 *
 * Returns null on anything malformed. Labels carry the `sc:*` model overrides,
 * so a half-parsed issue must not present as a valid one with an empty label
 * set — that would silently downgrade the run to default models, which is the
 * exact failure sandcastle-config.mts's gh preflight exists to prevent.
 */
export function parseIssueJson(stdout: string): ParsedIssue | null {
  let parsed: {
    title?: string;
    state?: string;
    labels?: { name?: string }[];
  };
  try {
    parsed = JSON.parse(stdout.trim());
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  if (!parsed.title || !parsed.state) return null;
  const labels = (parsed.labels ?? [])
    .map((l) => l?.name)
    .filter((n): n is string => Boolean(n));
  return { title: parsed.title, state: parsed.state, labels };
}

/**
 * First `worktree ` line of `git worktree list --porcelain`.
 *
 * git documents the primary checkout as always reported first, and the
 * worktree-reaper relies on that ordering to identify the one path it must
 * never remove.
 */
export function parsePrimaryWorktree(stdout: string): string | null {
  for (const line of stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      return line.slice('worktree '.length).trim() || null;
    }
  }
  return null;
}

/**
 * Path of the worktree holding `branch`, or null when the branch is not
 * registered as one. Porcelain output is record-oriented: a `worktree ` line
 * opens a record and a later `branch refs/heads/…` line belongs to whichever
 * one is open.
 */
export function parseWorktreeForBranch(stdout: string, branch: string): string | null {
  let currentPath: string | null = null;
  for (const line of stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      currentPath = line.slice('worktree '.length).trim();
    } else if (line.startsWith('branch refs/heads/')) {
      const worktreeBranch = line.slice('branch refs/heads/'.length).trim();
      if (worktreeBranch === branch && currentPath !== null) {
        return currentPath;
      }
    }
  }
  return null;
}

/** `git status --porcelain`: any output at all means uncommitted work. */
export function parseDirtiness(stdout: string): WorktreeDirtiness {
  return stdout.trim().length > 0 ? 'dirty' : 'clean';
}
