import { EXIT } from '@gate/visual-diff/policy';

/**
 * How a run and a capture set read in a table: the outcome vocabulary, and the
 * two formatters the numeric cells go through.
 *
 * The four outcome words are a contract, not copy. They are the CLI's exit
 * codes said out loud — `EXIT.ok`, `EXIT.diff`, `EXIT.broken` — and the
 * acceptance scenario reads them off the page, so `succeeded` and
 * `succeeded (diffs)` are two verdicts that must never collapse into one: a run
 * with diffs is a report to review, and calling it clean retires the review
 * before it happens.
 *
 * Nothing here is stored. `history.json` records the exit code (see
 * lib/jobs.ts) and this derives the word from it every time it is displayed —
 * a stored verdict is a claim that can disagree with the code beside it.
 */

const OUTCOMES = ['succeeded', 'succeeded (diffs)', 'failed', 'interrupted'] as const;

export type Outcome = (typeof OUTCOMES)[number];

/** The state role each outcome is drawn in. `muted` is not a state token pair —
 *  an interrupted run reported nothing, so it is greyed rather than coloured. */
export type OutcomeTone = 'success' | 'warning' | 'danger' | 'muted';

/**
 * What a recorded exit code came to.
 *
 * `null` is a run that never reported one: the process was killed, or the
 * container went away, and lib/jobs.ts deliberately keeps the null rather than
 * inventing a 2. Anything above `EXIT.broken` — a signal death, a code a later
 * version starts using — is the gate having broken too, which is what `failed`
 * says.
 */
export function outcomeOf(exitCode: number | null): Outcome {
  if (exitCode === null) return 'interrupted';
  if (exitCode === EXIT.ok) return 'succeeded';
  if (exitCode === EXIT.diff) return 'succeeded (diffs)';

  return 'failed';
}

export function outcomeTone(outcome: Outcome): OutcomeTone {
  if (outcome === 'succeeded') return 'success';
  if (outcome === 'succeeded (diffs)') return 'warning';
  if (outcome === 'failed') return 'danger';

  return 'muted';
}

/** How long a run took, or `null` when the pair of stamps cannot say. */
export function durationOf(startedAt: string, endedAt: string | null): number | null {
  if (endedAt === null) return null;

  const started = Date.parse(startedAt);
  const ended = Date.parse(endedAt);
  // A clock that went backwards mid-run, or a stamp nobody wrote as a date:
  // "-3s" in the table is a worse answer than the em dash an absent one gets.
  if (Number.isNaN(started) || Number.isNaN(ended) || ended < started) return null;

  return ended - started;
}

const MINUTE_MS = 60_000;

/**
 * `1m 35s`, or `42s` under a minute. Seconds floor rather than round: a run's
 * duration is elapsed time, and `1m 0s` for 59.6 seconds reads as a minute that
 * did not happen.
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (ms < MINUTE_MS) return `${seconds}s`;

  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/** Decimal units, in step with the byte budgets in `@gate/visual-diff/policy`,
 *  which are written as round decimal numbers. Gigabytes are the last step: a
 *  capture set past that is a corpus nobody should be storing per commit. */
const KB = 1_000;
const MB = 1_000_000;
const GB = 1_000_000_000;

/**
 * A size on disk, at one decimal place.
 *
 * Formatted by hand rather than through `toLocaleString`: the host's locale
 * decides that one's separators, and two instances of this console must not
 * disagree about what the same set weighs.
 */
export function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  if (bytes >= KB) return `${(bytes / KB).toFixed(1)} kB`;

  return `${bytes} B`;
}
