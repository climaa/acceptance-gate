import { headers } from 'next/headers';
import { resolveDataDir } from '@/lib/data';
import { dockerAvailable } from '@/lib/docker';
import { hostMatches } from '@/lib/host';
import { JobRequestSchema, startJob } from '@/lib/jobs';
import { isLocalHost } from '@/lib/local';
import {
  DOCKER_DOWN,
  JOB_RUNNING,
  NOT_LOCAL,
  SAMPLE_DATA,
  badRequest,
  conflict,
  jsonBody,
  refuseWhileRunning,
} from '@/lib/refusals';
import { runJob } from '@/lib/runner';

/**
 * Start a job — the one mutating entry point into the runner.
 *
 * It answers as soon as the lock is held (202), never when the job is done: a
 * capture takes minutes, and the log at `GET /api/jobs/current` is how progress
 * is watched. Two things can refuse it before anything starts, and both are
 * decisions rather than validation:
 *
 *  - The console is deployed. A job needs the checkout it compares; the panel
 *    shows no start button off-localhost, and this is the same wall for a POST
 *    that skips the UI. Read from the request's own `Host`, so one instance can
 *    answer both a loopback caller and a proxied one correctly.
 *  - D1, one job at a time. A second request is refused, not queued, so the
 *    console shows what is running instead of promising something later.
 *
 * D3 was a third. It gated an accept mode this console no longer has — one that
 * spawned `promote` into `<dataDir>/__baselines__`, gitignored, and never the
 * corpus CI compares against. Accepting is a commit now; see
 * `apps/storybook/src/docs/qa/VisualDiffWorkflow.mdx`.
 */
export async function POST(request: Request): Promise<Response> {
  const { dir, isSample } = await resolveDataDir();
  if (isSample) return conflict(SAMPLE_DATA);

  if (!isLocalHost((await headers()).get('host'))) return conflict(NOT_LOCAL);

  const busy = refuseWhileRunning(dir);
  if (busy) return busy;

  const parsed = JobRequestSchema.safeParse(await jsonBody(request));
  if (!parsed.success) {
    return badRequest(
      `that is not a job this console can run: ${issuesOf(parsed.error)}`,
    );
  }

  const job = parsed.data;

  // The panel disables its button on the same answer, so this is the POST that
  // skipped the UI — and the reason it is worth answering twice is that the
  // daemon can go down between the poll that enabled the button and the click.
  if (job.mode !== 'compare' && !hostMatches() && !dockerAvailable()) {
    return conflict(DOCKER_DOWN);
  }

  const outcome = startJob(dir, job, runJob);
  if (!outcome.ok) return conflict(JOB_RUNNING, { job: outcome.running });

  return Response.json({ job: outcome.started.job }, { status: 202 });
}

const issuesOf = (error: { issues: { path: PropertyKey[]; message: string }[] }) =>
  error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
