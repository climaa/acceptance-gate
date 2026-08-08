// git/gh CLI helpers — branch/worktree/issue lookups used by the
// stranded-branch rescue path and the per-issue implement→review pipeline.
// Read-only except for markIssueNoOp(), which comments and labels; the
// decisions it acts on are pure and live in sandcastle-noop-issues.mts.
import { execSync } from 'node:child_process';
import { BASE_BRANCH } from './sandcastle-config.mts';
import { type Dirtiness, worktreeReapBlocker } from './sandcastle-worktree-safety.mts';
import {
  parseBranchList,
  parseDirtiness,
  parseIssueJson,
  parsePositiveCount,
  parsePrimaryWorktree,
  parseWorktreeForBranch,
} from './sandcastle-git-parse.mts';
import {
  type GitProbe,
  classifyIssueViewFailure,
  classifyRevListFailure,
} from './sandcastle-git-probe.mts';
import type { PerIssueRole, ProfileOverride } from './sandcastle-model-overrides.mts';
import {
  NOOP_LABEL,
  NOOP_LABEL_COLOR,
  NOOP_LABEL_DESCRIPTION,
} from './sandcastle-noop-issues.mts';

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

// stderr captured off a thrown execSync error (a string because callers pass
// `encoding: 'utf8'`), falling back to the error message.
function stderrOf(err: unknown): string {
  const e = err as { stderr?: unknown; message?: unknown };
  return String(e.stderr ?? e.message ?? '');
}

// Does `branch` have commits ahead of origin/BASE_BRANCH? Distinguishes a
// genuinely-absent branch (first run — benign, `absent`) from a git that failed
// to answer (`error`), instead of collapsing both to false. The caller decides
// what an `error` means: main.mts's outcome-partition files it as failed rather
// than let a transient blip mark a real run no-op (F9).
export function probeBranchCommitsAhead(branch: string): GitProbe<boolean> {
  try {
    const out = execSync(`git rev-list --count origin/${BASE_BRANCH}..${branch}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { kind: 'ok', value: parsePositiveCount(out) };
  } catch (err) {
    const stderr = stderrOf(err);
    return classifyRevListFailure(stderr) === 'absent'
      ? { kind: 'absent' }
      : { kind: 'error', stderr };
  }
}

// Boolean convenience for callers that cannot act on the error/absent
// distinction (the stranded-rescue filter, runIssue's salvage check). Both
// absent and error collapse to false, exactly as before — the strict handling
// lives at the durable-state call site in main.mts, which uses the probe.
export function branchHasCommitsAhead(branch: string): boolean {
  const probe = probeBranchCommitsAhead(branch);
  return probe.kind === 'ok' ? probe.value : false;
}

export function listSandcastleBranches(): string[] {
  try {
    const out = execSync(
      `git for-each-ref --format='%(refname:short)' refs/heads/sandcastle/`,
      { encoding: 'utf8' },
    );
    return parseBranchList(out);
  } catch {
    return [];
  }
}

// Re-exported from sandcastle-git-parse.mts, where it is unit-tested. Kept on
// this module's surface because four call sites already import it from here.
export { parseIssueIdFromBranch } from './sandcastle-git-parse.mts';

// `labels` is what carries the per-issue model overrides (`sc:…`). It is
// fetched here, deterministically, rather than being threaded through the
// planner's <plan> JSON: a mechanism that decides cost and capability must not
// depend on an agent faithfully echoing strings, and the stranded-rescue path
// builds IssueRefs without the planner at all.
export type FetchedIssue = { title: string; state: string; labels: string[] };

// Probe an issue's state + labels. `absent` = gh resolved the query but the
// issue is gone; `error` = gh itself failed (auth/network/rate-limit) OR
// returned output we cannot parse. main.mts's eligibility pass throws on
// `error` rather than run the issue on default models with its sc:* overrides
// silently dropped (F9) — the same failure assertGhAvailable guards against.
export function probeIssue(id: string): GitProbe<FetchedIssue> {
  try {
    const out = execSync(`gh issue view ${id} --json title,state,labels`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const parsed = parseIssueJson(out);
    // gh succeeded but the JSON was unreadable — an error, not "no labels".
    return parsed
      ? { kind: 'ok', value: parsed }
      : { kind: 'error', stderr: 'gh issue view returned unparseable output' };
  } catch (err) {
    const stderr = stderrOf(err);
    return classifyIssueViewFailure(stderr) === 'absent'
      ? { kind: 'absent' }
      : { kind: 'error', stderr };
  }
}

// Boolean/null convenience for the stranded-rescue path, which already logs and
// skips on a null result. Both absent and error collapse to null, as before.
export function fetchIssue(id: string): FetchedIssue | null {
  const probe = probeIssue(id);
  return probe.kind === 'ok' ? probe.value : null;
}

// Record that a pipeline ran on this issue and produced nothing: a comment
// explaining what happened, then NOOP_LABEL so later iterations and later runs
// skip it. Never closes the issue — see sandcastle-noop-issues.mts.
//
// Every step fails soft. The caller also holds a run-scoped exclusion set, so a
// gh outage degrades to "not marked durably", not to "spins until
// MAX_ITERATIONS"; and a failed label add must not lose the comment that
// explains the situation to a human.
export function markIssueNoOp(
  id: string,
  body: string,
): { commented: boolean; labeled: boolean } {
  let commented = false;
  try {
    // Body on stdin: it is a multi-line template with backticks and quotes,
    // none of which survive interpolation into a shell command intact.
    execSync(`gh issue comment ${id} --body-file -`, {
      input: body,
      stdio: 'pipe',
    });
    commented = true;
  } catch (err) {
    console.warn(`  ⚠ could not comment on #${id}: ${(err as Error).message}`);
  }

  // `gh issue edit --add-label` refuses labels that do not exist, so create it
  // on first use. A failure here is expected on every subsequent call (the
  // label already exists) — the add below is what actually reports success.
  try {
    execSync(
      `gh label create "${NOOP_LABEL}" --color ${NOOP_LABEL_COLOR} ` +
        `--description "${NOOP_LABEL_DESCRIPTION}"`,
      { stdio: 'pipe' },
    );
  } catch {
    // Already exists, or the token cannot create labels — the add tells us.
  }

  let labeled = false;
  try {
    execSync(`gh issue edit ${id} --add-label "${NOOP_LABEL}"`, {
      stdio: 'pipe',
    });
    labeled = true;
  } catch (err) {
    console.warn(`  ⚠ could not label #${id} ${NOOP_LABEL}: ${(err as Error).message}`);
  }

  return { commented, labeled };
}

export function branchHasOpenPr(branch: string): boolean {
  try {
    const out = execSync(
      `gh pr list --head ${branch} --state open --json number --jq 'length'`,
      { encoding: 'utf8' },
    ).trim();
    return Number(out) > 0;
  } catch {
    return false;
  }
}

// The primary repository checkout. `git worktree list --porcelain` always
// reports it FIRST — that ordering is the documented contract and is what
// makes this cheap to identify (worktree-reaper hardening).
function primaryWorktreePath(): string | null {
  try {
    const out = execSync('git worktree list --porcelain', {
      encoding: 'utf8',
    });
    return parsePrimaryWorktree(out);
  } catch {
    return null;
  }
}

// Working-tree state of `worktreePath`. Fails CLOSED: a missing or broken
// checkout reports "unreadable", which blocks the reap just as "dirty" does —
// but says so accurately in the log rather than claiming uncommitted work.
// git's own stderr is swallowed so a missing path does not print a bare
// `fatal:` line above our explanation.
function worktreeDirtiness(worktreePath: string): Dirtiness {
  try {
    const out = execSync(`git -C "${worktreePath}" status --porcelain`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return parseDirtiness(out);
  } catch {
    return 'unreadable';
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
    const out = execSync('git worktree list --porcelain', {
      encoding: 'utf8',
    });
    return parseWorktreeForBranch(out, branch);
  } catch {
    return null;
  }
}
