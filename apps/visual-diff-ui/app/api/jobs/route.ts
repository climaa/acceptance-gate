import { HOST } from '@gate/visual-diff/policy';
import { headers } from 'next/headers';
import { resolveDataDir } from '@/lib/data';
import { hostFingerprint, hostMatches } from '@/lib/host';
import { JobRequestSchema, startJob } from '@/lib/jobs';
import { isLocalHost } from '@/lib/local';
import {
  ACCEPT_RECOVERY,
  JOB_RUNNING,
  NOT_LOCAL,
  SAMPLE_DATA,
  badRequest,
  conflict,
  hostMismatch,
  jsonBody,
  noReportAt,
  notFound,
  refuseWhileRunning,
} from '@/lib/refusals';
import { readSummary, runJob } from '@/lib/runner';

/**
 * Start a job — the one mutating entry point into the runner.
 *
 * It answers as soon as the lock is held (202), never when the job is done: a
 * capture takes minutes, and the log at `GET /api/jobs/current` is how progress
 * is watched. Three things can refuse it before anything starts, and all three
 * are decisions rather than validation:
 *
 *  - The console is deployed. A job needs the checkout it compares; the panel
 *    shows no start button off-localhost, and this is the same wall for a POST
 *    that skips the UI. Read from the request's own `Host`, so one instance can
 *    answer both a loopback caller and a proxied one correctly.
 *  - D1, one job at a time. A second request is refused, not queued, so the
 *    console shows what is running instead of promising something later.
 *  - D3, accept is container-bound. The client gate would be a review failure
 *    on its own — a POST that skips the UI must meet the same wall — so both
 *    the fingerprint and the report's accessibility count are checked here.
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
  if (job.mode === 'accept') {
    const refusal = refuseAccept(dir, job.reportId);
    if (refusal) return refusal;
  }

  const outcome = startJob(dir, job, runJob);
  if (!outcome.ok) return conflict(JOB_RUNNING, { job: outcome.running });

  return Response.json({ job: outcome.started.job }, { status: 202 });
}

const issuesOf = (error: { issues: { path: PropertyKey[]; message: string }[] }) =>
  error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');

/**
 * The accept gate (D3), server-side.
 *
 * The report is read here rather than trusted from the request: `counts.a11y`
 * is a property of what was captured, and a client that has decided the run is
 * clean is exactly the client this refusal exists for. The runner refuses again
 * on its own — this is the copy a reviewer sees, that is the last gate before a
 * byte is written.
 */
function refuseAccept(dataDir: string, reportId: string): Response | null {
  const summary = readSummary(dataDir, reportId);
  if (!summary) return notFound(noReportAt(reportId));

  if (summary.counts.a11y > 0) {
    return conflict(
      `this report carries ${summary.counts.a11y} accessibility failure(s) — reviewing never clears one, and baselining it would hide it for good`,
      { recovery: ACCEPT_RECOVERY },
    );
  }

  const fingerprint = hostFingerprint();
  if (!hostMatches(fingerprint)) {
    return conflict(hostMismatch(fingerprint.image), {
      recovery: ACCEPT_RECOVERY,
      image: HOST.image,
    });
  }

  return null;
}
