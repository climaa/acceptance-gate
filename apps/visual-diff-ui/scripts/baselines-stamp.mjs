// The commit that last accepted the committed corpus, read once at build time.
//
// `next.config.mjs` calls this and inlines the answer as
// `VISUAL_DIFF_BASELINES_ACCEPTED`, because a deployment has the corpus — traced
// into the function — but no git to ask about it: the function ships files, not a
// repository. `lib/baselines.ts` reads git first and falls back to this stamp, so
// a checkout keeps its live answer and a deployment shows the one its build saw.
//
// The answer is `<short sha> <YYYY-MM-DD>`, or the empty string when git cannot
// say. Empty rather than a guess, the rule lib/git.ts keeps for `lastCommit`: the
// card draws a dash, and a wrong sha would credit the corpus to a commit that
// never touched it.
//
// A shallow clone is the one place git answers WRONGLY rather than not at all.
// `git log -1 -- <path>` in a clone cut at depth N names the oldest commit it has
// whenever the real one is older — that boundary commit "added" every file, as
// far as a history with no parent can tell. So a hit on a boundary is unknown.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** The corpus, repo-root-relative. A third spelling of the path lib/baselines.ts
 *  names — exported so the suite pins the two together, since a drift here would
 *  stamp nothing and every deployed card would draw a dash without a test going red. */
export const BASELINES = 'packages/visual-diff/__baselines__';

/** Same bounds lib/git.ts sets, for the same reason: a locked index must not
 *  hang a build. */
const GIT_TIMEOUT_MS = 2000;

function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: GIT_TIMEOUT_MS,
  }).trim();
}

/** The full shas a shallow clone was cut at; none for a full history. */
function shallowBoundaries(root) {
  if (git(root, 'rev-parse', '--is-shallow-repository') !== 'true') return [];

  const file = resolve(root, git(root, 'rev-parse', '--git-path', 'shallow'));
  return readFileSync(file, 'utf8').split('\n').filter(Boolean);
}

/**
 * The stamp from `git log`'s three lines and the clone's boundaries — the pure
 * half, so the shallow rule is testable without cutting a clone.
 */
export function stampFrom(log, boundaries) {
  const [full, short, date] = log.split('\n');
  if (!full || !short || !date) return '';
  if (boundaries.includes(full)) return '';

  return `${short} ${date}`;
}

/** The stamp for the checkout at `root`, or `''` when git cannot say. */
export function baselinesStamp(root) {
  try {
    const log = git(
      root,
      'log',
      '-1',
      '--format=%H%n%h%n%ad',
      '--date=short',
      '--',
      BASELINES,
    );

    return stampFrom(log, shallowBoundaries(root));
  } catch {
    return '';
  }
}
