// Pure safety decisions for the stranded-branch worktree reaper (issue #1911).
//
// Deliberately imports NOTHING from this directory. `sandcastle-config.mts`
// has import-time side effects — it mutates `process.env.PATH` and logs on
// load — so every module that transitively pulls it in becomes untestable,
// which is why the other __tests__ here regex-assert source text instead of
// importing it. Keeping this decision pure and dependency-free is what lets
// the reaper's safety rules get REAL unit tests.
import * as path from "node:path";

/**
 * Where the SDK creates every sandbox worktree — it builds the path as
 * `join(repoDir, ".sandcastle", "worktrees", <name>)`. This is the only
 * directory the reaper is ever allowed to delete from.
 */
export const SANDCASTLE_WORKTREE_SEGMENT = path.join(
  ".sandcastle",
  "worktrees",
);

/**
 * Working-tree state. `"unreadable"` is deliberately distinct from `"dirty"`:
 * both block the reap, but they mean different things to whoever reads the
 * log — "someone has work in progress here" vs "this path is gone or broken".
 */
export type Dirtiness = "clean" | "dirty" | "unreadable";

export type ReapCandidate = {
  /** Path git reported for the worktree holding the branch. */
  worktreePath: string;
  /** The primary repository checkout, or null when it could not be resolved. */
  primaryPath: string | null;
  /** Working-tree state of that worktree. */
  dirtiness: Dirtiness;
};

/**
 * Returns a human-readable reason to SKIP reaping `worktreePath`, or `null`
 * when removal is safe.
 *
 * Three rules, in order of how much damage they prevent:
 *
 * 1. **Never the primary checkout.** In the #1911 incident the reaper ran
 *    `git worktree remove --force` against the developer's main working copy.
 *    Git refused (primary worktrees cannot be removed that way) and that
 *    refusal is the ONLY reason it was harmless — `--force` against a checkout
 *    holding uncommitted work is not an operation to attempt and recover from.
 * 2. **Allowlist, not denylist.** Only paths under
 *    `<primary>/.sandcastle/worktrees/` are reapable. A denylist ("not the
 *    primary") fails open: it would still target `.claude/worktrees/*`, sibling
 *    clones, or anything else a developer has registered. An allowlist fails
 *    closed — an unrecognised path is left alone.
 * 3. **Never a dirty worktree.** Uncommitted work is unrecoverable after
 *    `--force`; skip and let a human look.
 *
 * A null `primaryPath` is itself a blocker: if we cannot establish what the
 * primary checkout is, we cannot prove the target is not it, so we refuse
 * rather than guess.
 */
export function worktreeReapBlocker({
  worktreePath,
  primaryPath,
  dirtiness,
}: ReapCandidate): string | null {
  if (!worktreePath.trim()) return "the worktree path is empty";
  if (!primaryPath?.trim()) {
    return "the primary worktree could not be resolved (refusing to guess)";
  }

  const target = path.resolve(worktreePath);
  const primary = path.resolve(primaryPath);

  if (target === primary) {
    return "it is the PRIMARY repository checkout, not a sandbox worktree";
  }

  const allowRoot = path.join(primary, SANDCASTLE_WORKTREE_SEGMENT);
  const rel = path.relative(allowRoot, target);
  // `rel` escaping upward (`..`) or being absolute means `target` sits outside
  // the allowlist; an empty `rel` means it IS the container directory, which is
  // not itself a worktree.
  const insideAllowlist =
    rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  if (!insideAllowlist) {
    return `it is outside ${SANDCASTLE_WORKTREE_SEGMENT}/ (cleanup is allowlisted to that directory)`;
  }

  if (dirtiness === "unreadable") {
    return "its working tree could not be inspected (missing or broken checkout)";
  }
  if (dirtiness === "dirty") return "it has uncommitted changes";

  return null;
}
