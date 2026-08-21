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
 *
 * `jobState` adds a fifth word, `running`, which is the one thing an exit code
 * cannot say: a job that has not reported one yet and a job that never will are
 * the same row on disk. It lives here rather than beside either surface that
 * draws it, because two components deriving the same word two ways is exactly
 * how the history table came to call a live job `interrupted` while the panel
 * beside it said `running`.
 */

/** The state role an outcome is drawn in. `muted` is not a state token pair —
 *  an interrupted run reported nothing, so it is greyed rather than coloured. */
export type OutcomeTone = 'success' | 'warning' | 'danger' | 'muted';

/** The four words, each with the role it is drawn in. One table rather than two
 *  lists: a word without a tone would not compile. */
const TONES = {
  succeeded: 'success',
  'succeeded (diffs)': 'warning',
  failed: 'danger',
  interrupted: 'muted',
} satisfies Record<string, OutcomeTone>;

export type Outcome = keyof typeof TONES;

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
  return TONES[outcome];
}

/** The state role a live job is drawn in, beside the four a finished one has.
 *  `accent` is not an outcome tone: `running` is a state, not a verdict, so it
 *  takes the accent rather than borrowing success or warning. */
export type JobTone = OutcomeTone | 'accent';

/** The fifth word, and the only one that is not a verdict. Kept out of
 *  {@link Outcome} deliberately — that type is the CLI's exit codes said out
 *  loud, and the acceptance scenarios read all four off the page. */
export type JobState = Outcome | 'running';

/**
 * The state word beside a job: what it is doing, or what it came to.
 *
 * One function for both surfaces that draw it. A running job has no exit code
 * yet and `outcomeOf(null)` reads `interrupted` — a verdict on a job that is
 * very much alive — so liveness is an ARGUMENT here rather than something each
 * caller re-derives from a null. It has to be: on disk a running row and an
 * interrupted one are the same row, and only `job.lock` tells them apart (see
 * lib/jobs.ts). The current-job panel learns it from `GET /api/jobs/current`;
 * the history table learns it from the lock the page read (app/page.tsx).
 *
 * `exitCode === null` guards the running answer rather than trusting the flag
 * alone. `currentJob` reads the lock and then the history, so a job that
 * finishes between those two reads yields `running` over a record that already
 * carries its verdict — and a row reading `running` beside `exit 0` is the
 * disagreement this whole module exists to prevent.
 */
export function jobState(
  exitCode: number | null,
  running: boolean,
): { word: JobState; tone: JobTone } {
  if (running && exitCode === null) return { word: 'running', tone: 'accent' };

  const outcome = outcomeOf(exitCode);

  return { word: outcome, tone: outcomeTone(outcome) };
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

const SECONDS_PER_MINUTE = 60;

/** `2026-08-21T12:51:23.716Z`, with the fractional seconds optional — the shape
 *  `new Date().toISOString()` writes and `jobId` parses back. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/**
 * `1m 35s`, or `42s` under a minute. Seconds floor rather than round: a run's
 * duration is elapsed time, and `1m 0s` for 59.6 seconds reads as a minute that
 * did not happen.
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < SECONDS_PER_MINUTE) return `${seconds}s`;

  return `${Math.floor(seconds / SECONDS_PER_MINUTE)}m ${seconds % SECONDS_PER_MINUTE}s`;
}

/**
 * When a run started, as a reader reads it: `2026-08-21 12:51:23`.
 *
 * The stored value is an ISO stamp — `2026-08-21T12:51:23.716Z` — which is the
 * right thing to RECORD and the wrong thing to put in a table cell. It is 24
 * characters in a narrow column, so it wrapped onto three lines, and the two
 * parts a reviewer actually compares between rows (the day, and the time of
 * day) were the two the `T` ran together.
 *
 * Sliced, never parsed and reformatted. `new Date(...).toLocaleString()` would
 * hand the answer to the host's locale and timezone, and two consoles must not
 * disagree about when the same run started — the same rule `formatBytes` below
 * keeps for the same reason. Slicing also cannot drift: what is shown is a
 * substring of what is stored, so the full stamp stays in the cell's `title`
 * and the `Z` it ends in is where the timezone is stated.
 *
 * Anything that is not the stamp this app writes is passed through untouched. A
 * value that is not an ISO instant is a `history.json` some other tool wrote,
 * and showing it whole is more use to whoever has to explain it than showing
 * the first nineteen characters of it.
 */
export function formatStamp(startedAt: string): string {
  return ISO_INSTANT.test(startedAt)
    ? `${startedAt.slice(0, 10)} ${startedAt.slice(11, 19)}`
    : startedAt;
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
