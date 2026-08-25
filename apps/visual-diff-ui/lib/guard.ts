import { headers } from 'next/headers';
import { resolveDataDir } from './data';
import { isLocalHost } from './local';
import { NOT_LOCAL, SAMPLE_DATA, conflict, refuseWhileRunning } from './refusals';

/**
 * The three questions every mutation on this console answers before it does
 * anything, in the order it must answer them.
 *
 * Written four times before this module existed — once in each of `POST
 * /api/jobs`, `POST /api/prune`, `DELETE /api/reports/[id]` and `DELETE
 * /api/sets/[label]` — and the fourth copy is how the policy stopped being one.
 * `DELETE /api/sets/[label]` and `POST /api/prune` landed in #292 with no host
 * check, #305 and #321 added it to the other two, and nothing brought it back
 * to those. `next dev` binds every interface, so for that stretch anyone on the
 * network could delete every capture set on a console pointed at a real data
 * directory. A policy stated in four places is a policy three places can drift
 * from; stated here it is one function, and a new mutation gets it by calling
 * this rather than by remembering to.
 *
 * THE ORDER IS THE POLICY, not a style. Each question is asked only because the
 * one before it was answered:
 *
 *  1. Sample data first. An instance with no data directory behind it is serving
 *     the committed fixtures — this repo's files, not an instance's state. It is
 *     also the state every deployment is in, so asking this first is what makes
 *     a deployed console answer "there is nothing here to change" rather than
 *     "start one from your own machine": true of it, and the sentence a reviewer
 *     can act on.
 *  2. Then the host. A console reachable from off the machine must not be able
 *     to destroy what is on it. Read from the request's own `Host` so one
 *     instance answers a loopback caller and a proxied one correctly.
 *  3. Then the lock. D1: a run in flight holds the whole data directory, so a
 *     delete or a prune that raced it would pull a set out from under the job
 *     reading it. Last of the three because it is the only one that reads the
 *     disk, and the two above it are cheaper and more absolute.
 *
 * Deliberately NOT in lib/refusals.ts, where the sentences it returns live. That
 * module is imported by lib/runner.ts for two constants, and it is reached from
 * a detached job rather than from a request; giving it `next/headers` and the
 * cached read path for this function's sake would put a request-time API in the
 * graph of code that runs outside one.
 *
 * `GET /api/jobs/current` is the one route that reads the data directory and
 * calls none of this — it is deliberately ungated on localhost, because polling
 * a job's log destroys nothing and a deployed console still has to show what it
 * is showing.
 */

/** What a mutation may proceed with: the directory it is allowed to write. */
export interface Mutable {
  dir: string;
}

/**
 * The data directory this mutation may write, or the refusal that stops it.
 *
 * A `Response` back is final — it carries the sentence and the status, and the
 * caller's only correct move is to return it. Narrowing with `instanceof
 * Response` is what makes forgetting a type error rather than a hole: `Response`
 * has no `dir`, so a handler that skips the check cannot reach the directory.
 */
export async function guardMutation(): Promise<Mutable | Response> {
  const { dir, isSample } = await resolveDataDir();
  if (isSample) return conflict(SAMPLE_DATA);

  if (!isLocalHost((await headers()).get('host'))) return conflict(NOT_LOCAL);

  return refuseWhileRunning(dir) ?? { dir };
}
