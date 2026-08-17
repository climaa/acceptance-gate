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

/** The container command the accept mode degrades to off the pinned host.
 *  Transcribed from `packages/visual-diff/README.md`'s "Running the pinned
 *  container locally" — a reviewer copies this and it has to be the recipe that
 *  package documents, down to the browser path the image bakes in. */
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
 * The four answers, in the order they are asked.
 *
 * `accessibility` and `host` are refusals — the panel renders no run button at
 * all under either. `unreviewed` is a gate: the button is there and disabled,
 * because the reviewer is one pass away from being allowed to press it.
 */
export type AcceptGate =
  | { state: 'accessibility'; failures: number }
  | { state: 'host'; image: string | null }
  | { state: 'unreviewed'; reviewed: number; total: number }
  | { state: 'ready' };

export interface AcceptGateInput {
  /** The report's own bucket counts, as `summary.json` recorded them. */
  counts: Record<Bucket, number>;
  /** The image the runner declares, from `GET /api/env`. Null is a refusal. */
  image: string | null;
  /** How many variant keys are marked reviewed for this report, in this browser. */
  reviewed: number;
}

/**
 * Accessibility first, then the host, then the review.
 *
 * The order is the decision. An accessibility failure outranks a matching
 * container — a violation baselined away is hidden for good, and reviewing never
 * clears one — and the host outranks the review, because a reviewer who has read
 * every card on the wrong machine still may not write baselines from it.
 *
 * `reviewed >= total` rather than equality: marks are keyed by variant, and a
 * report rewritten under the same id can hold fewer variants than the reader
 * already marked. Having seen more than the report shows is not a reason to
 * refuse.
 */
export function acceptGate({ counts, image, reviewed }: AcceptGateInput): AcceptGate {
  if (counts.a11y > 0) return { state: 'accessibility', failures: counts.a11y };
  if (image !== HOST.image) return { state: 'host', image };

  const total = reviewableCount(counts);

  return reviewed >= total
    ? { state: 'ready' }
    : { state: 'unreviewed', reviewed, total };
}
