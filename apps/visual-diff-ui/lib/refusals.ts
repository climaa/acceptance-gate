import { HOST } from '@gate/visual-diff/policy';
import { currentJob } from './jobs';

/**
 * The words a refused mutation says, and the responses that carry them.
 *
 * Every string here is user-facing prose: the alerts and dialogs the run panel
 * builds render these verbatim, so a bare `job_running` reaching a screen is a
 * review failure. They live in one module because two of them are asserted
 * word-for-word — by this app's own suite, and by the e2e worlds — and copy
 * that is a contract belongs somewhere a reader can find all of it at once.
 * Two of them are said twice over — once by the accept gate in
 * `POST /api/jobs`, once by the runner behind it — which is the other reason
 * for one home: two copies of one sentence drift.
 */

/** D1. The console shows the running job instead of queueing a second one. */
export const JOB_RUNNING = 'a job is already running';

/** The read-only case: an instance with no data directory behind it is serving
 *  the committed fixtures, which are this repo's files and not an instance's
 *  state. Refusing here is what keeps a deployed demo from deleting them. */
export const SAMPLE_DATA =
  'this console is showing sample data — there is nothing here to change';

/** The deployed case. A job needs the checkout it compares, a Storybook build to
 *  serve and a browser to drive it, and a deployment has none of the three — so
 *  this names the console that does rather than only refusing the one that
 *  cannot. Said twice over: `POST /api/jobs` answers with it, and the run panel
 *  spells it out client-side (see RunPanel's `REMOTE_REFUSAL`). */
export const NOT_LOCAL =
  'this console is deployed, and a job needs the checkout it compares — start one from the console on your own machine (`pnpm --filter @gate/visual-diff-ui dev`)';

/** The belt to that braces: a console that passed the local gate but is not in a
 *  checkout after all. Reached only by a runner started from outside the repo,
 *  and it says what is missing rather than reporting an empty Storybook build. */
export const NO_CHECKOUT =
  'this console is not running inside a repository checkout, so there is nothing to capture';

/** A capture serves a Storybook build, so it builds one first. Its own output is
 *  already in the log above this line; what this adds is that the capture never
 *  started, rather than leaving a reader to infer it from silence. */
export const STORYBOOK_FAILED =
  'the storybook build failed, so there was nothing to capture against';

/** The reminder, not a refusal after the fact: a capture runs inside the pinned
 *  container, and a machine whose Docker is not up cannot start one. Named by
 *  the panel before the button is pressed, and by the server if one is anyway. */
export const DOCKER_DOWN = `this capture runs inside ${HOST.image}, and Docker is not running — start Docker and this comes back`;

/** D3. Shown after any refused or aborted accept: the two commands that put a
 *  half-written corpus back, in the order they have to run. */
export const ACCEPT_RECOVERY = [
  'git checkout -- __baselines__/',
  'git clean -fd __baselines__/',
];

/** The canonical corpus is committed, not captured: it is changed by a commit and
 *  by `accept` inside the pinned container, and no console owns it. Refused rather
 *  than hidden, because a POST that skips the UI asks the same thing. */
export const CANONICAL_IS_COMMITTED =
  'the baseline corpus is committed to this repository — it is changed by a commit, never by this console';

/** D2. Names both halves — what is held, and what holds it — because "cannot
 *  delete" is not something a reviewer can act on and a worktree path is. */
export const heldByWorktree = (label: string, worktreePath: string) =>
  `${label} is checked out in the worktree at ${worktreePath} — retire that worktree before deleting the set`;

/** D3. Names the image this host declares, or says it declares none: a process
 *  cannot see its own container, and silence is a refusal rather than a pass. */
export const hostMismatch = (declared: string | null) =>
  `this runner is ${declared ?? 'not running in a declared container'}, not ${HOST.image} — baselines are only acceptable from the pinned container`;

/** An accept naming a report this instance does not have. */
export const noReportAt = (reportId: string) => `no report at reports/${reportId}`;

/** A refusal, never a bare code. `extra` carries whatever the screen renders
 *  beside the sentence: the running job, the recovery commands, the held sets. */
export function conflict(error: string, extra: Record<string, unknown> = {}): Response {
  return Response.json({ error, ...extra }, { status: 409 });
}

/** The refusal every mutation shares: a run in flight holds the whole data
 *  directory, so a delete or a prune that races it would pull a set out from
 *  under the job reading it. Answered before a request is even parsed, because
 *  "a job is already running" is the state of the console rather than a verdict
 *  on what was asked for. A lock whose process is gone does not hold anything —
 *  `currentJob` reads it as nobody, and the next `startJob` retires it. */
export function refuseWhileRunning(dataDir: string): Response | null {
  const job = currentJob(dataDir);

  return job ? conflict(JOB_RUNNING, { job }) : null;
}

export function notFound(error: string): Response {
  return Response.json({ error }, { status: 404 });
}

export function badRequest(error: string): Response {
  return Response.json({ error }, { status: 400 });
}

/** The request's JSON body, or null when it carries none this parser could read.
 *  A missing body and a malformed one are the same refusal — the schema each
 *  mutating route parses with rejects null, and says so in its own words. */
export async function jsonBody(request: Request): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch {
    return null;
  }
}
