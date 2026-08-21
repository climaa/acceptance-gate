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
/**
 * The memoised answer for the working directory, and the directory it is the
 * answer FOR.
 *
 * Only the default is memoised. An explicit `from` is a caller probing a
 * directory it may still be building — `git.test.ts` writes the marker between
 * two asks — so caching those would report a checkout that did not exist yet.
 * The default is the one on the request path: the dashboard reaches it on every
 * render through `readCanonicalSet`, and an uncached walk is an `existsSync`
 * per level of the path, every time.
 *
 * Keyed on the directory rather than merely set once, because "the working
 * directory cannot change" is a claim about a server, not about a process —
 * `process.chdir` exists, and a memo that ignored it would answer every later
 * caller with the checkout of a directory nobody is in any more.
 *
 * `cwdRootFor` is the presence test; `cwdRoot` may legitimately be `null`,
 * meaning "that directory is in no checkout", so the two cannot share a slot.
 */
let cwdRootFor: string | undefined;
let cwdRoot: string | null = null;

export function repoRoot(from: string = process.cwd()): string | null {
  const cwd = process.cwd();
  const memoised = from === cwd;
  if (memoised && cwdRootFor === cwd) return cwdRoot;

  let dir = path.resolve(from);

  for (;;) {
    const found = fs.existsSync(path.join(dir, WORKSPACE_MARKER));
    const parent = path.dirname(dir);

    if (found || parent === dir) {
      const answer = found ? dir : null;
      if (memoised) {
        cwdRootFor = cwd;
        cwdRoot = answer;
      }

      return answer;
    }

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
/**
 * How long a `git` invocation may take before it is killed, and how much it may
 * say before it is cut off.
 *
 * Both defaults were wrong for a request path. With no `timeout`, a repository
 * whose index is locked by another process blocks this one — and because these
 * are synchronous spawns, "this one" is the whole Node event loop, every other
 * request on the server included. With the default 1 MB `maxBuffer`,
 * `status --porcelain` on a very dirty tree throws, and the `catch` below reads
 * that as "git could not say", which lands in a set's provenance as `unknown`.
 *
 * Two seconds is far above what any of these three commands takes on a healthy
 * repository and far below anything a reviewer would sit through. 16 MB of
 * porcelain is roughly 150,000 changed paths.
 */
const GIT_TIMEOUT_MS = 2000;
const GIT_MAX_BUFFER = 16 * 1024 * 1024;

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_MAX_BUFFER,
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
/**
 * The commit that last touched `pathspec`, or null when git cannot say.
 *
 * The provenance of something this console did not capture: the committed
 * baseline corpus is CI's work, and the only honest answer to "where did these
 * come from" is the commit that accepted them. The BRANCH is deliberately not
 * part of it — a commit does not record the branch it was made on, and naming the
 * one currently checked out would attribute the corpus to whoever happens to be
 * looking at it.
 */
export function lastCommit(
  root: string,
  pathspec: string,
): { sha: string; date: string } | null {
  try {
    const [sha, date] = git(
      root,
      'log',
      '-1',
      '--format=%h%n%ad',
      '--date=short',
      '--',
      pathspec,
    ).split('\n');

    // A path git knows nothing about answers with nothing at all, not an error.
    return sha && date ? { sha, date } : null;
  } catch {
    return null;
  }
}

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
