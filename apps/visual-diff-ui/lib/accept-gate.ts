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
 * One CLI subcommand, run inside the pinned container.
 *
 * Transcribed from `packages/visual-diff/README.md`'s "Running the pinned
 * container locally" — a reviewer copies this and it has to be the recipe that
 * package documents, down to the browser path the image bakes in
 * (`PLAYWRIGHT_BROWSERS_PATH` points at the browser baked into the image rather
 * than a host cache that is the wrong OS's build, and `--ipc=host` keeps
 * Chromium off Docker's 64MB `/dev/shm`).
 *
 * One builder for the two subcommands: they differ by a single word, and two
 * transcriptions of one recipe drift.
 */
const containerCommand = (cli: 'check' | 'accept', ...before: string[]) =>
  [
    ...before,
    'docker run --rm --ipc=host -v "$(pwd)":/repo -w /repo \\',
    '  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \\',
    `  ${ACCEPT_IMAGE} \\`,
    `  node packages/visual-diff/src/cli.mjs ${cli}`,
  ].join('\n');

/** The container command the accept mode degrades to off the pinned host. */
export const ACCEPT_COMMAND = containerCommand('accept');

/**
 * The container command capture and run degrade to off the pinned host.
 *
 * Carries the Storybook build the differ serves, which `accept` does not need
 * and `check` cannot run without — the README puts it first for the same reason,
 * and it stays on the host because static output is not platform-dependent.
 *
 * Note what this does NOT do: it runs the CLI, so its artifacts land in
 * `packages/visual-diff/.visual-diff/` rather than becoming a capture set in
 * this console. A console whose captures write sets has to be a console running
 * inside that container.
 */
export const CHECK_COMMAND = containerCommand(
  'check',
  'pnpm --filter @gate/storybook build',
  '',
);

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
 * Accessibility first, then the review, then the host.
 *
 * The order is the decision. An accessibility failure outranks both of the
 * others — a violation baselined away is hidden for good, reviewing never clears
 * one, and no container makes it acceptable — so it is asked first and answered
 * alone.
 *
 * The review comes before the host because that is the order the work happens
 * in, and the order `features/visual-diff-accept.feature` pins: accept is gated
 * until the review completes, and only a report that has been read through
 * degrades to the container command. Reports are read on the machine the
 * reviewer has, which is almost never the pinned image — asking the host first
 * would mean a console that never once asks for the reading it exists to
 * collect. Nothing is loosened by the swap: the button under `unreviewed` is
 * disabled either way, `POST /api/jobs` re-asks the host question with the
 * process in front of it, and `promoteBaselines` asks it again as the last thing
 * before a byte would land.
 *
 * `reviewed >= total` rather than equality: marks are keyed by variant, and a
 * report rewritten under the same id can hold fewer variants than the reader
 * already marked. Having seen more than the report shows is not a reason to
 * refuse.
 */
export function acceptGate({ counts, image, reviewed }: AcceptGateInput): AcceptGate {
  if (counts.a11y > 0) return { state: 'accessibility', failures: counts.a11y };

  const total = reviewableCount(counts);
  if (reviewed < total) return { state: 'unreviewed', reviewed, total };

  return image === HOST.image ? { state: 'ready' } : { state: 'host', image };
}
