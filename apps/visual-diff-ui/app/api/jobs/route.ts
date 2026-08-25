import { dockerAvailable } from '@/lib/docker';
import { guardMutation } from '@/lib/guard';
import { hostMatches } from '@/lib/host';
import { startJob } from '@/lib/jobs';
import { JobRequestSchema } from '@/lib/job-contract';
import { DOCKER_DOWN, JOB_RUNNING, badRequest, conflict, jsonBody } from '@/lib/refusals';
import { runJob } from '@/lib/runner';

/**
 * Start a job — the one mutating entry point into the runner.
 *
 * It answers as soon as the lock is held (202), never when the job is done: a
 * capture takes minutes, and the log at `GET /api/jobs/current` is how progress
 * is watched.
 *
 * Two of the three refusals ahead of it are this route's oldest arguments and
 * are now `guardMutation`'s, along with the order they are asked in: a job needs
 * the checkout it compares, so a deployed console cannot start one, and D1 means
 * a second request is refused rather than queued — the console shows what is
 * running instead of promising something later. The panel already shows no start
 * button off-localhost; the guard is the same wall for a POST that skips the UI.
 *
 * D3 was a third. It gated an accept mode this console no longer has — one that
 * spawned `promote` into `<dataDir>/__baselines__`, gitignored, and never the
 * corpus CI compares against. Accepting is a commit now; see
 * `apps/storybook/src/docs/qa/VisualDiffWorkflow.mdx`.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await guardMutation();
  if (gate instanceof Response) return gate;
  const { dir } = gate;

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
