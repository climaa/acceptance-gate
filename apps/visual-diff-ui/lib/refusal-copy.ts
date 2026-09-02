import { HOST } from '@gate/visual-diff/policy';

/**
 * The words a refused mutation says. Only the words.
 *
 * Every string here is user-facing prose, rendered verbatim: the alerts, notes and
 * dialogs the console builds print these as they are, so a bare `job_running`
 * reaching a screen is a review failure. Three of them are asserted word-for-word
 * — by this app's own suite and by the e2e worlds — which is the first reason they
 * live in one place a reader can see all of at once.
 *
 * The second reason is what split them out of lib/refusals.ts, which still holds
 * the functions that CARRY these sentences. That module reaches the filesystem:
 * `refuseWhileRunning` reads the lock through lib/jobs.ts. `RunPanel` is a client
 * component and cannot import it, so it spelled three of these sentences out a
 * second time and pinned the copies with equality assertions — `RUNNING_REFUSAL`,
 * `DOCKER_REFUSAL` and `REMOTE_REFUSAL`, each a comment explaining that it was a
 * duplicate held by a test rather than by a boundary.
 *
 * A leaf fixes that rather than documenting it. Nothing here but the pinned
 * container's name, so the server that answers with a sentence and the panel that
 * says what the server would have answered now read the same constant.
 *
 * lib/tags.ts is the precedent and states the principle for four cache-tag strings:
 * "Keeping them here means the write path does not have to import the read path."
 * Same argument, applied to the copy both halves render.
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
 *  cannot. Every mutation answers with it — `POST /api/jobs`,
 *  `DELETE /api/reports/[id]`, `DELETE /api/sets/[label]`, `POST /api/prune` —
 *  and the run panel spells it out client-side (see RunPanel's
 *  `REMOTE_REFUSAL`). The two deletes and the prune need no checkout of their
 *  own; what they share with a job is that a console reachable from off the
 *  machine must not be able to destroy what is on it. */
export const NOT_LOCAL =
  'this console is deployed, and a job needs the checkout it compares — start one from the console on your own machine (`pnpm --filter @gate/visual-diff-ui dev`)';

/** The provenance case, and the only one of these a browser can be made to ask
 *  for on a reviewer's behalf. A page on another origin can POST here without a
 *  preflight — `Content-Type: text/plain` is a CORS-simple request — and the
 *  browser attaches this machine's own `Host`, so the local gate has nothing to
 *  say about it. This names the site rather than the header, because the header
 *  is not something the person reading this can do anything about. */
export const NOT_SAME_ORIGIN =
  'this request came from another site rather than from this console — only pages served by this console may change what is on this machine';

/** The other half of that answer, for the body a CORS-simple request has to
 *  send. Phrased as what to send instead, because a client this refuses is a
 *  client someone is writing: a mutation with no body at all is fine, and the
 *  two deletes send none. */
export const NOT_JSON =
  'this mutation carries a body this console will not read — send it as `Content-Type: application/json`, or send no body at all';

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

/** The reminder, not a refusal after the fact: every job this console runs
 *  happens inside the pinned container, and a machine whose Docker is not up
 *  cannot start one. Named by the panel before the button is pressed, and by the
 *  server if one is anyway. */
export const DOCKER_DOWN = `this job runs inside ${HOST.image}, and Docker is not running — start Docker and this comes back`;

/** The canonical corpus is committed, not captured: it is changed by a commit —
 *  from the `accept-baselines` workflow, or from `accept` run in the pinned
 *  container — and no console owns it. Refused rather than hidden, because a POST
 *  that skips the UI asks the same thing. */
export const CANONICAL_IS_COMMITTED =
  'the baseline corpus is committed to this repository — it is changed by a commit, never by this console';

/** D2. Names both halves — what is held, and what holds it — because "cannot
 *  delete" is not something a reviewer can act on and a worktree path is. */
export const heldByWorktree = (label: string, worktreePath: string) =>
  `${label} is checked out in the worktree at ${worktreePath} — retire that worktree before deleting the set`;
