import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveDataDir } from '@/lib/data';
import { hostFingerprint, hostMatches } from '@/lib/host';
import { JobRequestSchema, reportDir, startJob } from '@/lib/jobs';
import {
  ACCEPT_RECOVERY,
  JOB_RUNNING,
  SAMPLE_DATA,
  badRequest,
  conflict,
  notFound,
  refuseWhileRunning,
} from '@/lib/refusals';
import { runJob } from '@/lib/runner';
import { HOST } from '@gate/visual-diff/policy';
import { SummarySchema } from '@/lib/summary';

/**
 * Start a job — the one mutating entry point into the runner.
 *
 * It answers as soon as the lock is held (202), never when the job is done: a
 * capture takes minutes, and the log at `GET /api/jobs/current` is how progress
 * is watched. Two things can refuse it before anything starts, and both are
 * decisions rather than validation:
 *
 *  - D1, one job at a time. A second request is refused, not queued, so the
 *    console shows what is running instead of promising something later.
 *  - D3, accept is container-bound. The client gate would be a review failure
 *    on its own — a POST that skips the UI must meet the same wall — so both
 *    the fingerprint and the report's accessibility count are checked here.
 */
export async function POST(request: Request): Promise<Response> {
  const { dir, isSample } = await resolveDataDir();
  if (isSample) return conflict(SAMPLE_DATA);

  const busy = refuseWhileRunning(dir);
  if (busy) return busy;

  const parsed = JobRequestSchema.safeParse(await readBody(request));
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

async function readBody(request: Request): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch {
    return null;
  }
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
  if (!summary) return notFound(`no report at reports/${reportId}`);

  if (summary.counts.a11y > 0) {
    return conflict(
      `this report carries ${summary.counts.a11y} accessibility failure(s) — reviewing never clears one, and baselining it would hide it for good`,
      { recovery: ACCEPT_RECOVERY },
    );
  }

  const fingerprint = hostFingerprint();
  if (!hostMatches(fingerprint)) {
    return conflict(
      `this runner is ${fingerprint.image ?? 'not running in a declared container'}, not ${HOST.image} — baselines are only acceptable from the pinned container`,
      { recovery: ACCEPT_RECOVERY, image: HOST.image },
    );
  }

  return null;
}

function readSummary(dataDir: string, reportId: string) {
  try {
    return SummarySchema.parse(
      JSON.parse(
        fs.readFileSync(path.join(reportDir(dataDir, reportId), 'summary.json'), 'utf8'),
      ),
    );
  } catch {
    return null;
  }
}
