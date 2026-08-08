// git/gh CLI helpers — branch/worktree/issue lookups used by the
// stranded-branch rescue path and the per-issue implement→review pipeline.
// Read-only except for markIssueNoOp(), which comments and labels; the
// decisions it acts on are pure and live in sandcastle-noop-issues.mts.
import { execSync, type ExecSyncOptions } from 'node:child_process';
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
import {
  NOOP_LABEL,
  NOOP_LABEL_COLOR,
  NOOP_LABEL_DESCRIPTION,
} from './sandcastle-noop-issues.mts';

// Re-exported from its own type-only module so this module's five importers keep
// `import { IssueRef } from './sandcastle-git.mts'` working unchanged.
export type { IssueRef } from './sandcastle-issue-ref.mts';

// stderr captured off a thrown execSync error (a string because callers pass
// `encoding: 'utf8'`), falling back to the error message.
function stderrOf(err: unknown): string {
  const e = err as { stderr?: unknown; message?: unknown };
  return String(e.stderr ?? e.message ?? '');
}

// Run a read-only git/gh command and return its stdout, or null on any non-zero
// exit. For the lookups whose only failure handling is "a failure means nothing
// is there — fall back to a benign default": it collapses the repeated
// try/execSync/catch-return-default shape into one place. NOT for the probes
// above (they must see WHY the command failed) or markIssueNoOp's writes (each
// catch has its own warning).
function execOrNull(command: string, options: ExecSyncOptions = {}): string | null {
  try {
    return execSync(command, { ...options, encoding: 'utf8' });
  } catch {
    return null;
  }
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

// The branch the given checkout is on, or null (detached HEAD or not a repo).
// `cwd` defaults to the process cwd; it exists so a test can point at a scratch
// repo without chdir'ing the whole process.
export function currentBranch(cwd: string = process.cwd()): string | null {
  const out = execOrNull('git rev-parse --abbrev-ref HEAD', { cwd });
  return out === null ? null : out.trim() || null;
}

// Put the host checkout back on the branch the run started on (worktree-reaper
// hardening).
//
// The merger sandbox BIND-MOUNTS the host checkout, and merge-prompt.md tells
// the agent to `git checkout <branch>` first (later steps read `HEAD` — the PR
// diff and `gh pr create --head`). That checkout therefore lands on the host and
// outlives the run: afterwards the developer's main checkout sits on a feature
// branch, every later command silently operates on it, and the branch cannot be
// deleted because it is "used by worktree".
//
// `git checkout` never discards work: it carries non-conflicting local changes
// across, and refuses outright when the switch would overwrite them. So the
// failure path here is a warning telling the developer where they are, never
// data loss — which is also why this must NOT be a `checkout --force`.
export function restoreHostBranch(
  startingBranch: string,
  cwd: string = process.cwd(),
): void {
  const now = currentBranch(cwd);
  if (now === null || now === startingBranch) return;
  try {
    execSync(`git checkout ${startingBranch}`, { cwd, stdio: 'pipe' });
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

export function listSandcastleBranches(): string[] {
  const out = execOrNull(
    `git for-each-ref --format='%(refname:short)' refs/heads/sandcastle/`,
  );
  return out === null ? [] : parseBranchList(out);
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
  const out = execOrNull(
    `gh pr list --head ${branch} --state open --json number --jq 'length'`,
  );
  return out !== null && Number(out.trim()) > 0;
}

// The primary repository checkout. `git worktree list --porcelain` always
// reports it FIRST — that ordering is the documented contract and is what
// makes this cheap to identify (worktree-reaper hardening).
function primaryWorktreePath(): string | null {
  const out = execOrNull('git worktree list --porcelain');
  return out === null ? null : parsePrimaryWorktree(out);
}

// Working-tree state of `worktreePath`. Fails CLOSED: a missing or broken
// checkout reports "unreadable", which blocks the reap just as "dirty" does —
// but says so accurately in the log rather than claiming uncommitted work.
// git's own stderr is swallowed so a missing path does not print a bare
// `fatal:` line above our explanation.
function worktreeDirtiness(worktreePath: string): Dirtiness {
  // stderr ignored so a missing path does not print a bare `fatal:` above our
  // explanation; a non-zero exit means we could not inspect it → "unreadable".
  const out = execOrNull(`git -C "${worktreePath}" status --porcelain`, {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return out === null ? 'unreadable' : parseDirtiness(out);
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
  const out = execOrNull('git worktree list --porcelain');
  return out === null ? null : parseWorktreeForBranch(out, branch);
}
