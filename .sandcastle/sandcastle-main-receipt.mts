// Whether `main` has a receipt once a run has landed something on it.
//
// A receipt is keyed by tree (scripts/gate/run.mjs, `--verify`). Each PR is
// verified on its head when the host pushes it, but the commit that lands on
// `main` has a tree of its own whenever another PR merged after the branch was
// cut, and a run that merges several PRs makes that the usual case. A child
// project found its `main` with no receipt only when an exit check asked for
// one; nothing had reported the gap.
//
// So a run that moved `origin/main` ends by asking, and says the answer as its
// last line. It reports and never runs the gate itself: verifying `main` takes a
// clean checkout of it, which is the person's to make, not the orchestrator's.
//
// "Moved" is read off `origin/main` before and after the run, not off what the
// merger says it merged: the merger arms auto-merge and GitHub lands the PR, so
// the remote is the one place that knows. A push by someone else during the run
// moves it too, and the question is just as worth asking then.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

// @ts-expect-error — plain .mjs with JSDoc types, no declaration file.
import { withoutAmbientGit } from '../scripts/gate/git-env.mjs';
import { BASE_BRANCH } from './sandcastle-config.mts';
import { execOrNull } from './sandcastle-git.mts';

/** A fetch or the verify that hangs (a stalled network, a credential prompt) must
 *  not hold the end of a run, which also runs after a Ctrl-C. */
const TIMEOUT_MS = 60_000;

/** The host's git, never a hook's `GIT_DIR`, and never waiting on a prompt: a
 *  credential prompt fails at once instead of at the timeout. */
const GIT_ENV = {
  ...withoutAmbientGit(),
  GIT_TERMINAL_PROMPT: '0',
  GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? 'ssh -o BatchMode=yes',
};

/** `--verify`'s answer: its exit 0 and 1, or anything else (the check broke). */
export type Verdict = 'verified' | 'no-receipt' | 'broken';

/** What the fetch got: `main` (false means a stale `origin/main` would answer for
 *  it), and the receipts written on other machines (false when this host's have
 *  diverged from origin's, so a receipt pushed elsewhere may be missing here). */
export interface Fetched {
  main: boolean;
  notes: boolean;
}

/** What the report needs from git and the gate, so it can be tested without either. */
export interface ReceiptProbe {
  fetch(): Fetched;
  /** The commit `origin/main` points at, or null when it cannot be read. */
  head(): string | null;
  /** Whether `origin/main`'s tree has a receipt. */
  verify(): Verdict;
}

/** The commands that give `main` a receipt, in the order they have to run. The
 *  notes fetch comes first so the push at the end is a fast-forward; it fails, and
 *  stops the chain, when the notes have diverged, which `MERGE_NOTES` mends. */
export const FIX_COMMANDS =
  'git fetch origin refs/notes/gate:refs/notes/gate && ' +
  `git checkout ${BASE_BRANCH} && git pull --ff-only && pnpm gate && ` +
  'git push origin refs/notes/gate';

/** Joins this host's receipts with origin's when the two have diverged, keeping
 *  this host's note where both hold one for a commit (either is a receipt), and
 *  publishes the result. */
export const MERGE_NOTES =
  'git fetch origin +refs/notes/gate:refs/notes/gate-origin && ' +
  'git notes --ref=gate merge -s ours refs/notes/gate-origin && ' +
  'git push origin refs/notes/gate';

/**
 * The run's last line about `main`, or null when the run left it where it was.
 *
 * @param before  `origin/main` when the run started, or null if it was unreadable.
 *   An unreadable start cannot prove `main` stayed put, so it is asked about.
 */
export function mainReceiptReport(
  before: string | null,
  probe: ReceiptProbe,
): string | null {
  const fetched = probe.fetch();
  if (!fetched.main) {
    return `${BASE_BRANCH} receipt unknown: origin/${BASE_BRANCH} could not be fetched after the run`;
  }
  const after = probe.head();
  if (after === null) {
    return `${BASE_BRANCH} receipt unknown: origin/${BASE_BRANCH} could not be read after the run`;
  }
  if (after === before) return null;

  const short = after.slice(0, 7);
  const verdict = probe.verify();
  if (verdict === 'verified') return `${BASE_BRANCH} verified ${short}`;
  if (verdict === 'broken') {
    return `${BASE_BRANCH} receipt unknown for ${short}: \`pnpm gate --verify origin/${BASE_BRANCH}\` broke; run it to see why`;
  }
  if (!fetched.notes) {
    return (
      `${BASE_BRANCH} receipt unknown for ${short}: this host's receipts have diverged ` +
      `from origin's, so one written elsewhere may be missing here. Join them, then ask again:\n  ${MERGE_NOTES}`
    );
  }
  return `${BASE_BRANCH} has no receipt ${short}. To give it one:\n  ${FIX_COMMANDS}`;
}

/** `origin/main`'s commit on this host, or null. */
export function originHead(cwd: string): string | null {
  return (
    execOrNull(`git rev-parse origin/${BASE_BRANCH}`, {
      cwd,
      stdio: 'pipe',
      env: GIT_ENV,
    })?.trim() ?? null
  );
}

/** `git fetch origin main` on this host; true when it succeeded. */
function fetchMain(cwd: string): boolean {
  return (
    spawnSync('git', ['fetch', '-q', 'origin', BASE_BRANCH], {
      cwd,
      stdio: 'ignore',
      timeout: TIMEOUT_MS,
      env: GIT_ENV,
    }).status === 0
  );
}

/** `origin/main` as the run starts, fetched first so the comparison is fair. A
 *  failed fetch would record a stale commit, so it records nothing instead. */
export function startingMain(cwd: string): string | null {
  return fetchMain(cwd) ? originHead(cwd) : null;
}

/** `--verify`'s exit code and output, read as a verdict. Exit 1 alone is not "no
 *  receipt": an uncaught throw (a bad ref, a missing script) exits 1 too, so the
 *  gate's own `✗ no receipt` line has to be there. */
export const verdictOf = (status: number | null, output = ''): Verdict =>
  status === 0
    ? 'verified'
    : status === 1 && output.includes('✗ no receipt for')
      ? 'no-receipt'
      : 'broken';

/**
 * The probe against this host's checkout.
 *
 * The notes fetch is not forced, so a receipt written on this host and not yet
 * pushed is never overwritten. When the two diverge that fetch is refused, and
 * the report does not trust a "no receipt" read off this host's notes alone.
 */
export function hostReceiptProbe(cwd: string): ReceiptProbe {
  return {
    fetch() {
      if (!fetchMain(cwd)) return { main: false, notes: false };
      const notes = spawnSync(
        'git',
        ['fetch', '-q', 'origin', 'refs/notes/*:refs/notes/*'],
        { cwd, stdio: 'ignore', timeout: TIMEOUT_MS, env: GIT_ENV },
      );
      return { main: true, notes: notes.status === 0 };
    },
    head: () => originHead(cwd),
    verify() {
      const run = spawnSync(
        process.execPath,
        [join(cwd, 'scripts/gate/run.mjs'), '--verify', `origin/${BASE_BRANCH}`],
        { cwd, stdio: 'pipe', encoding: 'utf8', timeout: TIMEOUT_MS, env: GIT_ENV },
      );
      return verdictOf(run.status, `${run.stdout ?? ''}${run.stderr ?? ''}`);
    },
  };
}
