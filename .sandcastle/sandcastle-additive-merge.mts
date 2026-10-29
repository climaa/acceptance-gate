// The one kind of conflict the PR queue resolves: two branches that each added
// lines at the same place in a file that only ever grows.
//
// Every issue PR adds a line under `## Unreleased` in CHANGELOG.md. When one
// iteration merges several PRs in turn, every PR after the first is DIRTY on
// that one hunk, so N PRs cost N−1 human resolutions, and each one is the same
// mechanical step: merge main into the branch and keep both entries.
//
// WHY SO NARROW. Auto-resolving conflicts in general is what once shipped a
// nested `@media` block: a resolution that is plausible line by line and wrong as
// a whole. So the resolver refuses everything but:
//
// - a file on ADDITIVE_FILES (CHANGELOG.md alone, to start);
// - every hunk in it a PURE ADDITION on both sides. diff3 shows the common
//   ancestor's lines between `|||||||` and `=======`; an empty ancestor means
//   neither side changed or removed a line that was there, they both only
//   inserted. A hunk where either side edited an existing line is refused, even
//   in CHANGELOG.md, and so is any hunk that is not exactly one well-formed
//   ours / base / theirs triple.
//
// Any other conflicted file in the same merge leaves the whole PR to a human.
// The result is the branch's lines first, then main's: CHANGELOG.md adds its
// newest entry at the top of `## Unreleased`, and the branch is the one landing
// later, so that is the order it would have written had it been cut after main.
//
// DETERMINISTIC HOST CODE, NOT THE MERGER AGENT. The merger is told never to
// resolve a conflict (merge-prompt.md), and that stands. This runs in the
// host-side queue (sandcastle-pr-queue.mts), in a scratch worktree, and pushes
// the merge commit from the host, so `pre-push` runs the gate on it (`--at`)
// exactly as it does on every other host push. It refuses to push at all where
// that hook would not run (no hook installed, or `SC_SKIP_GATE=1`): main's
// ruleset requires no check, so an ungated push here could auto-merge unread.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// @ts-expect-error — plain .mjs with JSDoc types, no declaration file.
import { withoutAmbientGit } from '../scripts/gate/git-env.mjs';
import { BASE_BRANCH } from './sandcastle-config.mts';

/** Files whose conflicts may be resolved by keeping both sides. Each one only
 *  ever grows by insertion; `pnpm-workspace.yaml`'s `packages:` may join once
 *  this has proved itself. */
export const ADDITIVE_FILES: readonly string[] = ['CHANGELOG.md'];

export type Resolution = { ok: true; text: string } | { ok: false; reason: string };

/** A refusal is `retry` when its cause can pass on its own (a fetch, a refused
 *  push); the queue offers such a PR once more before calling a human. */
export type Refusal = { ok: false; reason: string; retry?: boolean };

const OURS = /^<{7}(?: |$)/;
const BASE = /^\|{7}(?: |$)/;
const SPLIT = /^={7}$/;
const THEIRS = /^>{7}(?: |$)/;

type Hunk = { ours: string[]; base: string[] | null; theirs: string[] };

const isMarker = (line: string) =>
  OURS.test(line) || BASE.test(line) || SPLIT.test(line) || THEIRS.test(line);

/** Why a hunk with an empty base still cannot be kept whole, or null. diff3
 *  does not trim what the two sides share, so a line both added (a re-landed
 *  entry) would come out twice. */
function sharedAddition(file: string, { ours, theirs }: Hunk): string | null {
  const mine = new Set(ours.filter((line) => line.trim() !== ''));
  const twice = theirs.find((line) => mine.has(line));
  return twice === undefined
    ? null
    : `${file} gains the same line on both sides (${twice.slice(0, 60)}); keeping both would repeat it`;
}

/**
 * Read one hunk starting after its `<<<<<<<` line: it and the index after its
 * `>>>>>>>`, or null for anything but one ours, at most one base, exactly one
 * split, theirs, and a closing marker. A malformed hunk is refused, never
 * guessed at.
 */
function readHunk(
  lines: readonly string[],
  from: number,
): { hunk: Hunk; next: number } | null {
  const hunk: Hunk = { ours: [], base: null, theirs: [] };
  let section: string[] = hunk.ours;
  let splits = 0;
  let i = from;
  for (; i < lines.length && !THEIRS.test(lines[i]!); i++) {
    const line = lines[i]!;
    if (OURS.test(line)) return null;
    if (BASE.test(line) && hunk.base === null && splits === 0) {
      section = hunk.base = [];
    } else if (SPLIT.test(line)) {
      splits++;
      section = hunk.theirs;
    } else {
      section.push(line);
    }
  }
  if (i === lines.length || splits !== 1) return null;
  return { hunk, next: i + 1 };
}

/**
 * Resolve a file conflicted by `git merge origin/main` run on the branch, in
 * diff3 style: the first side (`<<<<<<<`) is the branch, the last (`>>>>>>>`)
 * is main. Every hunk must be a pure addition on both sides.
 *
 * @param file  Its path, for the refusal's sentence.
 * @param text  The file with its conflict markers.
 */
export function resolveAdditive(file: string, text: string): Resolution {
  const lines = text.split('\n');
  const out: string[] = [];
  let hunks = 0;
  for (let i = 0; i < lines.length;) {
    if (!OURS.test(lines[i]!)) {
      out.push(lines[i++]!);
      continue;
    }
    const read = readHunk(lines, i + 1);
    if (read === null) {
      return { ok: false, reason: `${file} has a malformed conflict; refusing` };
    }
    const { hunk, next } = read;
    if (hunk.base === null) {
      return { ok: false, reason: `${file} was not merged in diff3 style; refusing` };
    }
    if (hunk.base.length > 0) {
      return {
        ok: false,
        reason: `${file} has a hunk where a side changed an existing line; only pure additions are resolved`,
      };
    }
    const twice = sharedAddition(file, hunk);
    if (twice !== null) return { ok: false, reason: twice };
    out.push(...hunk.ours, ...hunk.theirs);
    hunks++;
    i = next;
  }
  if (hunks === 0) return { ok: false, reason: `${file} holds no conflict to resolve` };
  // A marker-shaped line in the added content closes a hunk early and leaves git's
  // own marker behind as text; a resolution is never allowed to carry one.
  if (out.some(isMarker)) {
    return {
      ok: false,
      reason: `${file} still holds a conflict marker after resolving; refusing`,
    };
  }
  return { ok: true, text: out.join('\n') };
}

/** What the resolver needs from the outside, so it can be tested on real git
 *  repositories without installing or pushing anything. */
export type MergeIO = {
  /** `pnpm install --frozen-lockfile` in `dir`; true when it succeeded. */
  install: (dir: string) => boolean;
  /** Push `sha` to `branch` on origin from the host; true when it was accepted. */
  push: (sha: string, branch: string) => boolean;
};

export type MergeOutcome = { ok: true; sha: string } | Refusal;

type Git = (...args: string[]) => { status: number; stdout: string; stderr: string };

/** git in `cwd`, never steered by an ambient GIT_DIR or GIT_WORK_TREE. */
const gitIn =
  (cwd: string): Git =>
  (...args) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: withoutAmbientGit() });
    return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  };

/** Resolve every conflicted file in the scratch worktree, or say why not. */
function resolveConflictedFiles(git: Git, dir: string): string | null {
  const conflicted = git('diff', '--name-only', '--diff-filter=U')
    .stdout.split('\n')
    .filter(Boolean);
  if (conflicted.length === 0) return 'the merge failed without a conflicted file';
  const outside = conflicted.filter((file) => !ADDITIVE_FILES.includes(file));
  if (outside.length > 0) {
    return `conflict in ${outside.join(', ')}, which the queue never resolves`;
  }
  for (const file of conflicted) {
    // A modify/delete conflict lacks the deleting side's stage (2 is the branch,
    // 3 is main), and the file left behind carries no markers to resolve.
    const stages = git('ls-files', '-u', '--', file).stdout;
    const bothSides = / 2\t/.test(stages) && / 3\t/.test(stages);
    if (!bothSides || !existsSync(join(dir, file))) {
      return `${file} was deleted on one side; refusing`;
    }
    const resolved = resolveAdditive(file, readFileSync(join(dir, file), 'utf8'));
    if (!resolved.ok) return resolved.reason;
    writeFileSync(join(dir, file), resolved.text);
    git('add', '--', file);
  }
  return null;
}

/** Merge origin/main into the branch's tip in `dir`, resolving what may be. */
function mergeMain(git: Git, dir: string, branch: string): MergeOutcome {
  const merge = git(
    '-c',
    'merge.conflictStyle=diff3',
    'merge',
    '--no-ff',
    '--no-edit',
    `origin/${BASE_BRANCH}`,
  );
  if (merge.status !== 0) {
    const refused = resolveConflictedFiles(git, dir);
    if (refused !== null) return { ok: false, reason: refused };
    const message = `Merge origin/${BASE_BRANCH} into ${branch}, keeping both sides of ${ADDITIVE_FILES.join(', ')}`;
    if (git('commit', '--no-edit', '-m', message).status !== 0) {
      return { ok: false, reason: 'the resolved merge could not be committed' };
    }
  }
  return { ok: true, sha: git('rev-parse', 'HEAD').stdout.trim() };
}

/** Merge, check and push, in the scratch worktree `dir`. */
function mergeCheckPush(dir: string, branch: string, io: MergeIO): MergeOutcome {
  const git = gitIn(dir);
  const merged = mergeMain(git, dir, branch);
  if (!merged.ok) {
    git('merge', '--abort');
    return merged;
  }
  // GitHub said DIRTY, but here main merges in as nothing: the two views
  // disagree, and pushing the same tip again would only loop. GitHub's
  // mergeability lags a push, so a resolution pushed a pass ago can still read
  // DIRTY: worth one more look before a human is called.
  if (merged.sha === git('rev-parse', `origin/${branch}`).stdout.trim()) {
    return {
      ok: false,
      reason: `${BASE_BRANCH} is already in ${branch} here, though GitHub reports a conflict`,
      retry: true,
    };
  }
  const lockMoved =
    git('diff', '--quiet', `origin/${branch}`, 'HEAD', '--', 'pnpm-lock.yaml').status !==
    0;
  if (lockMoved && !io.install(dir)) {
    return {
      ok: false,
      reason: 'pnpm-lock.yaml changed in the merge and no longer installs frozen',
    };
  }
  if (!io.push(merged.sha, branch)) {
    return {
      ok: false,
      reason: 'the host push of the merge was refused (gate or GitHub)',
      retry: true,
    };
  }
  return merged;
}

/**
 * Merge `origin/main` into a DIRTY PR's branch, resolve what may be resolved,
 * and push the merge from the host. Anything else is refused with the reason,
 * and the branch on origin is left as it was. Never throws: a failure here is
 * one PR's refusal, not the queue's.
 *
 * @param branch  The PR's head branch.
 * @param root  The host checkout.
 */
export function resolveDirtyBranch(
  branch: string,
  root: string,
  io: MergeIO,
): MergeOutcome {
  const host = gitIn(root);
  if (host('fetch', '-q', 'origin', BASE_BRANCH, branch).status !== 0) {
    return {
      ok: false,
      reason: `could not fetch ${BASE_BRANCH} and ${branch}`,
      retry: true,
    };
  }
  let dir: string | undefined;
  try {
    dir = mkdtempSync(join(tmpdir(), 'sandcastle-additive-merge-'));
    if (host('worktree', 'add', '-q', '--detach', dir, `origin/${branch}`).status !== 0) {
      return { ok: false, reason: `could not check out ${branch} in a scratch worktree` };
    }
    return mergeCheckPush(dir, branch, io);
  } catch (err) {
    return { ok: false, reason: `the resolver failed: ${(err as Error).message}` };
  } finally {
    if (dir !== undefined) {
      host('worktree', 'remove', '--force', dir);
      rmSync(dir, { recursive: true, force: true });
      host('worktree', 'prune');
    }
  }
}

/**
 * Why a push from `root` would not run the gate, or null when it would. The hook
 * lives in `core.hooksPath` (Husky's `.husky/_`, which `pnpm install` makes), and
 * `SC_SKIP_GATE=1` turns it into a no-op.
 */
export function ungatedPush(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (env.SC_SKIP_GATE === '1') return 'SC_SKIP_GATE=1 would skip the gate on the push';
  const hooks = gitIn(root)('config', 'core.hooksPath').stdout.trim() || '.git/hooks';
  return existsSync(join(root, hooks, 'pre-push'))
    ? null
    : `no pre-push hook in ${hooks}; run pnpm install so the push is gated`;
}

/** The IO against this host: a frozen install in the scratch worktree, and a
 *  push from the host checkout, so `pre-push` verifies the merge with `--at`.
 *  The push is never attempted where the gate would not run. */
export function hostMergeIO(root: string): MergeIO {
  return {
    install: (dir) =>
      spawnSync('pnpm', ['install', '--frozen-lockfile'], {
        cwd: dir,
        stdio: 'inherit',
        env: withoutAmbientGit(),
      }).status === 0,
    push: (sha, branch) => {
      const ungated = ungatedPush(root);
      if (ungated !== null) {
        console.warn(`  ⚠ not pushing the merge of ${branch}: ${ungated}`);
        return false;
      }
      return (
        spawnSync('git', ['push', 'origin', `${sha}:refs/heads/${branch}`], {
          cwd: root,
          stdio: 'inherit',
          env: withoutAmbientGit(),
        }).status === 0
      );
    },
  };
}
