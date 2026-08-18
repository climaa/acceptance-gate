import { resolveDataDir } from '@/lib/data';
import { currentJob, jobLog, readHistory } from '@/lib/jobs';

/** How much of the log one poll carries. The panel shows a tail, and a job that
 *  has been running for an hour must not be answered with an hour of it. */
const TAIL_LINES = 200;

/**
 * What is running, and what it has said — the poll target.
 *
 * `no-store`, because every value here is about right now: a cached answer is a
 * job that finished being reported as running, or a log that stopped growing.
 *
 * When nothing is running it answers with the LAST run instead of nothing. The
 * end of a job is the moment a reviewer most needs its log — `exit <code>` is
 * its final line — and a panel that empties the moment the job ends throws that
 * away.
 */
export async function GET(): Promise<Response> {
  const { dir, isSample } = await resolveDataDir();

  const running = currentJob(dir);
  const job = running ?? readHistory(dir)[0] ?? null;

  return Response.json(
    {
      isSample,
      running: running !== null,
      job,
      log: job ? jobLog(dir, job.id, TAIL_LINES) : [],
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
