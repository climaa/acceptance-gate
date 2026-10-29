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

import { BASE_BRANCH } from './sandcastle-config.mts';
import { execOrNull } from './sandcastle-git.mts';

/** A fetch or the verify that hangs (a stalled network, a credential prompt) must
 *  not hold the end of a run, which also runs after a Ctrl-C. */
const TIMEOUT_MS = 60_000;

/** `--verify`'s answer: its exit 0 and 1, or anything else (the check broke). */
export type Verdict = 'verified' | 'no-receipt' | 'broken';

/** What the report needs from git and the gate, so it can be tested without either. */
export interface ReceiptProbe {
  /** Fetch `main` and the receipts written on other machines; false when `main`
   *  could not be fetched, since a stale `origin/main` would answer for it. */
  fetch(): boolean;
  /** The commit `origin/main` points at, or null when it cannot be read. */
  head(): string | null;
  /** Whether `origin/main`'s tree has a receipt. */
  verify(): Verdict;
}

/** The commands that give `main` a receipt, in the order they have to run. */
export const FIX_COMMANDS =
  `git checkout ${BASE_BRANCH} && git pull --ff-only && pnpm gate && ` +
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
  if (!probe.fetch()) {
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
  return `${BASE_BRANCH} has no receipt ${short}. To give it one:\n  ${FIX_COMMANDS}`;
}

/** `origin/main`'s commit on this host, or null. */
export function originHead(cwd: string): string | null {
  return (
    execOrNull(`git rev-parse origin/${BASE_BRANCH}`, { cwd, stdio: 'pipe' })?.trim() ??
    null
  );
}

/** `git fetch origin main` on this host; true when it succeeded. */
function fetchMain(cwd: string): boolean {
  return (
    spawnSync('git', ['fetch', '-q', 'origin', BASE_BRANCH], {
      cwd,
      stdio: 'ignore',
      timeout: TIMEOUT_MS,
    }).status === 0
  );
}

/** `origin/main` as the run starts, fetched first so the comparison is fair. A
 *  failed fetch would record a stale commit, so it records nothing instead. */
export function startingMain(cwd: string): string | null {
  return fetchMain(cwd) ? originHead(cwd) : null;
}

/** `--verify`'s exit code, read as a verdict. */
export const verdictOf = (status: number | null): Verdict =>
  status === 0 ? 'verified' : status === 1 ? 'no-receipt' : 'broken';

/**
 * The probe against this host's checkout.
 *
 * The notes fetch is not forced, so a receipt written on this host and not yet
 * pushed is never overwritten. When the two diverge that fetch is refused, and
 * the check reads the local receipts it has; a warning says so.
 */
export function hostReceiptProbe(cwd: string): ReceiptProbe {
  return {
    fetch() {
      if (!fetchMain(cwd)) return false;
      const notes = spawnSync(
        'git',
        ['fetch', '-q', 'origin', 'refs/notes/*:refs/notes/*'],
        {
          cwd,
          stdio: 'ignore',
          timeout: TIMEOUT_MS,
        },
      );
      if (notes.status !== 0) {
        console.warn(
          '  ⚠ could not fetch refs/notes from origin; reading the receipts this host has',
        );
      }
      return true;
    },
    head: () => originHead(cwd),
    verify: () =>
      verdictOf(
        spawnSync(
          process.execPath,
          [join(cwd, 'scripts/gate/run.mjs'), '--verify', `origin/${BASE_BRANCH}`],
          { cwd, stdio: 'ignore', timeout: TIMEOUT_MS },
        ).status,
      ),
  };
}
