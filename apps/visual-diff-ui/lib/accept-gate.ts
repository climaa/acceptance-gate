import { HOST } from '@gate/visual-diff/policy';
import type { Bucket } from './summary';

/**
 * Whether this console may promote a report's shots into the baselines — D3,
 * as a decision rather than as a screen.
 *
 * The CLI's `accept` carries no host guard: run bare-metal it silently writes
 * host-rendered baselines and stamps `BASELINE_ENV.json` as if they came from
 * the pinned container. This module is the guard it lacks, and the panel that
 * renders the answer is only the surface of it.
 *
 * Nothing here decides anything the server does not decide again. `POST
 * /api/jobs` re-asks the accessibility and host questions with the report and
 * the process in front of it, so a POST that skips this UI meets the same wall;
 * what this adds is the third question no server can answer — whether a human
 * has actually looked, which lives in that human's browser (lib/review-state.ts)
 * and never reaches a server at all.
 *
 * Client-safe on purpose: policy constants and arithmetic, no `node:` import, so
 * the run panel can import it directly.
 */

/** The one host baselines may be written from, named by policy. Re-exported
 *  here so the screen that compares against it and the command that degrades to
 *  it read the same value from the same import. */
export const ACCEPT_IMAGE = HOST.image;

/**
 * The container command accept falls back to when there is no daemon to start
 * one with.
 *
 * Transcribed from `packages/visual-diff/README.md`'s "Running the pinned
 * container locally" — a reviewer copies this and it has to be the recipe that
 * package documents, down to the browser path the image bakes in.
 *
 * It is the LAST resort now rather than the answer. Accept used to hand this
 * over on any host but the pinned image, which made it the one mode that still
 * asked for a paste; it now starts that container itself, exactly as the capture
 * modes do (lib/docker.ts). What is left for this string is the case no button
 * can help with — Docker installed and not running, or not installed at all.
 */
export const ACCEPT_COMMAND = [
  'docker run --rm --ipc=host -v "$(pwd)":/repo -w /repo \\',
  '  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \\',
  `  ${ACCEPT_IMAGE} \\`,
  '  node packages/visual-diff/src/cli.mjs accept',
].join('\n');

/**
 * How many variants of a report a reviewer is shown.
 *
 * Everything but `unchanged`: the differ drops unchanged variants before
 * `summary.variants` is written, so they are cards nobody can open and counting
 * them would hold accept closed forever on a run where six things moved and a
 * hundred did not.
 */
export function reviewableCount(counts: Record<Bucket, number>): number {
  return Object.entries(counts)
    .filter(([bucket]) => bucket !== 'unchanged')
    .reduce((total, [, count]) => total + count, 0);
}

/**
 * The three answers, in the order they are asked.
 *
 * `accessibility` is a refusal — the panel renders no run button at all under
 * it. `unreviewed` is a gate: the button is there and disabled, because the
 * reviewer is one pass away from being allowed to press it.
 *
 * The HOST is no longer one of these. It used to be a fourth answer and a
 * refusal, because a promote off the pinned image writes a corpus stamped with
 * the wrong machine; the console now runs the pinned container itself, so the
 * host decides HOW the job runs rather than whether there is one. What can still
 * stop it is having no daemon to start that container with, and that is a
 * property of the machine rather than of the report — `containerState` in the
 * run panel answers it for accept exactly as it does for capture and run.
 */
export type AcceptGate =
  | { state: 'accessibility'; failures: number }
  | { state: 'unreviewed'; reviewed: number; total: number }
  | { state: 'ready' };

export interface AcceptGateInput {
  /** The report's own bucket counts, as `summary.json` recorded them. */
  counts: Record<Bucket, number>;
  /** How many variant keys are marked reviewed for this report, in this browser. */
  reviewed: number;
}

/**
 * Accessibility first, then the review.
 *
 * The order is the decision. An accessibility failure outranks the other — a
 * violation baselined away is hidden for good, reviewing never clears one, and
 * no container makes it acceptable — so it is asked first and answered alone.
 *
 * Both questions here are about the REPORT, which is why the host is not among
 * them: whether this machine can run the pinned container is a fact about the
 * machine, it is the same fact for every mode, and `containerState` in the run
 * panel already answers it for capture and run. Asking it twice in two
 * vocabularies is how accept ended up the one mode that refused where the others
 * offered a button.
 *
 * Nothing is loosened by dropping it. `POST /api/jobs` refuses a job it has no
 * container for, on the same rule it always applied to capture; and `promote`
 * stamps what actually ran, so a corpus written from the wrong machine says so
 * and the next `check` refuses to compare against it.
 *
 * `reviewed >= total` rather than equality: marks are keyed by variant, and a
 * report rewritten under the same id can hold fewer variants than the reader
 * already marked. Having seen more than the report shows is not a reason to
 * refuse.
 */
export function acceptGate({ counts, reviewed }: AcceptGateInput): AcceptGate {
  if (counts.a11y > 0) return { state: 'accessibility', failures: counts.a11y };

  const total = reviewableCount(counts);
  if (reviewed < total) return { state: 'unreviewed', reviewed, total };

  return { state: 'ready' };
}
