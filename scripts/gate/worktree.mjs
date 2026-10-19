// @ts-check
//
// The throwaway checkout a `--at` run verifies in.
//
// Its own module because `run.mjs` ends in `process.exitCode = run(...)` — a
// top-level side effect, so importing it to look at anything runs the entire
// gate. That is not a small detail: it is why trucutru #211 went unnoticed. `--at` built
// a worktree it never installed into, and no test could say so without
// executing the thing it was testing.
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withoutAmbientGit } from './git-env.mjs';

/** Repo root: this file is two levels down, same as `run.mjs` reckons it. */
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/**
 * What it takes to make a worktree a check can actually run in, in order.
 *
 * Data rather than statements so the regression can read it without paying for
 * an install — `scripts/__tests__/gate-worktree.test.ts`.
 *
 * **The install is the whole of #211.** A detached worktree is a fresh checkout
 * of a tree, and pnpm keeps every workspace's `node_modules` IN the tree — so
 * until this ran, `--at` handed each check a repository with no dependencies.
 * `test`, `health`, `sandcastle` and `e2e` all failed on `node_modules missing`,
 * for a commit whose entire diff was fourteen lines of Markdown. Nothing noticed
 * because `pre-push.mjs` reaches for `--at` only when the sha being pushed is
 * not the one checked out, and the ordinary push is of the branch you are on.
 *
 * Two details carry weight:
 *
 * - **`cwd` is the worktree, never `REPO_ROOT`.** An install pointed at the real
 *   checkout would reach out of the sandbox this exists to build and rewrite the
 *   developer's `node_modules` from another commit's lockfile — the shape of
 *   #163. The test pins it.
 * - **`--frozen-lockfile`,** from the worktree's own lockfile. The sha being
 *   verified need not want what is installed beside it, and `--at` exists so the
 *   checkout's state never answers for another commit's. A lockfile that
 *   disagrees with its `package.json` is a finding, not something to resolve on
 *   the way past.
 *
 * It costs about five seconds: pnpm's store is content-addressable, so a fresh
 * worktree is hardlinked rather than downloaded.
 *
 * @param {string} root
 * @param {string} sha
 * @returns {{ checkout: { command: string, cwd: string }, install: { command: string, cwd: string } }}
 */
export const worktreeSteps = (root, sha) => ({
  checkout: { command: `git worktree add --detach ${root} ${sha}`, cwd: REPO_ROOT },
  install: { command: 'pnpm install --frozen-lockfile', cwd: root },
});

/**
 * A detached worktree at `sha`, installed, and its cleanup.
 *
 * `--detach` because the branch may be checked out elsewhere, and a second
 * worktree on the same branch is refused. `run.mjs` disposes of it in a
 * `finally` so a failing check leaves no worktree behind; a failing install is
 * disposed of here, which would otherwise strand one before the caller has
 * anything to dispose.
 *
 * @param {string} sha
 * @returns {{ root: string, dispose: () => void }}
 */
export function worktreeAt(sha) {
  const root = mkdtempSync(join(tmpdir(), 'acceptance-gate-gate-'));
  const { checkout, install } = worktreeSteps(root, sha);
  const dispose = () => {
    execSync(`git worktree remove --force ${root}`, {
      cwd: REPO_ROOT,
      stdio: 'pipe',
      env: withoutAmbientGit(),
    });
    rmSync(root, { recursive: true, force: true });
  };

  execSync(checkout.command, {
    cwd: checkout.cwd,
    stdio: 'pipe',
    env: withoutAmbientGit(),
  });

  try {
    // Announced, and inherited rather than piped: five silent seconds in the
    // middle of a push reads as a hang.
    process.stdout.write(`\n→ dependencies, as ${sha.slice(0, 7)} locks them\n`);
    execSync(install.command, {
      cwd: install.cwd,
      stdio: 'inherit',
      env: withoutAmbientGit(),
    });
  } catch (error) {
    dispose();

    throw error;
  }

  return { root, dispose };
}
