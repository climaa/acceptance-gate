import { currentJob } from './jobs';
import { JOB_RUNNING } from './refusal-copy';

// Re-exported, so a route that answers with a sentence still imports the sentence
// and the response from one place. The copy itself lives in a leaf that a client
// component can also reach — see lib/refusal-copy.ts.
export * from './refusal-copy';

/**
 * The responses that carry a refusal, and the one that decides it.
 *
 * The sentences themselves moved to lib/refusal-copy.ts and are re-exported above,
 * so a route still names the refusal and the response together. What is left here
 * is everything that could not follow them into a client bundle: `refuseWhileRunning`
 * reads the D1 lock through lib/jobs.ts, and `node:fs` is two imports down from
 * that.
 *
 * That split is the whole point. `RunPanel` renders three of these sentences and
 * could not import this module, so it spelled them out again and pinned the copies
 * with equality assertions. It imports them now.
 */

/** A refusal, never a bare code. `extra` carries whatever the screen renders
 *  beside the sentence: the running job, the held sets. */
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
