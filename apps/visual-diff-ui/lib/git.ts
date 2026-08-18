import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Which checkout this console is running inside, and what git says about it.
 *
 * Both answers are provenance for a capture set: the differ's inputs come from
 * the checkout, and the row the console draws claims which commit produced the
 * shots. A guess in either place would be a claim about a set nobody could
 * reproduce, so both return null rather than a fallback.
 */

/** The file that marks the top of this monorepo. Chosen over `.git` because a
 *  worktree checkout carries `.git` as a FILE and a submodule carries one too;
 *  the workspace manifest is at the root and nowhere else. */
const WORKSPACE_MARKER = 'pnpm-workspace.yaml';

/**
 * The repo checkout `from` sits in, or null when it sits in none.
 *
 * The start directory is an argument with a default rather than a read at module
 * scope, so both answers are reachable from a test — the shape
 * `showsDevStorybook` uses in lib/report-view.ts. Walking up for the marker
 * rather than resolving a fixed number of levels: `next dev` runs with this
 * workspace as its working directory, but a console launched from anywhere else
 * would be handed a directory that is not a checkout at all, and the differ
 * would report the missing Storybook build instead of the missing repo.
 */
export function repoRoot(from: string = process.cwd()): string | null {
  let dir = path.resolve(from);

  for (;;) {
    if (fs.existsSync(path.join(dir, WORKSPACE_MARKER))) return dir;

    const parent = path.dirname(dir);
    if (parent === dir) return null;

    dir = parent;
  }
}

export interface Checkout {
  /** The full sha. `SetsTable` draws the first seven and keeps the whole of it
   *  on `title`, which is what a reviewer copies out. */
  sha: string;
  branch: string;
  dirty: boolean;
}

/** A detached HEAD has no branch name, and `rev-parse --abbrev-ref` says so by
 *  answering with the literal string. Recorded as this instead: `HEAD` in the
 *  branch column reads as a branch someone named HEAD. */
const DETACHED = 'detached';

/**
 * Read git rather than `.git`.
 *
 * `dirty` cannot be answered from the directory at all — it needs the index and
 * a hash of every tracked file — and the two that could be are three shapes
 * each: `.git` is a file inside a worktree checkout, refs may be packed by a
 * `gc`, and a detached HEAD holds a sha where a ref belongs. Four parsers to
 * avoid one subprocess, on a path that is about to launch a browser.
 */
function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

/**
 * What git says about the checkout at `root`, or null when it cannot say — no
 * repository there, no `git` on PATH, a corrupt object store.
 *
 * `status --porcelain` counts untracked files deliberately: an untracked
 * `*.stories.tsx` is a story this run will capture, so it is a difference the
 * set has to own up to. `.gitignore` already keeps build output out of it.
 */
export function describeCheckout(root: string): Checkout | null {
  try {
    const branch = git(root, 'rev-parse', '--abbrev-ref', 'HEAD');

    return {
      sha: git(root, 'rev-parse', 'HEAD'),
      branch: branch === 'HEAD' ? DETACHED : branch,
      dirty: git(root, 'status', '--porcelain') !== '',
    };
  } catch {
    return null;
  }
}
