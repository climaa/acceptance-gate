import { resolveDataDir } from '@/lib/data';
import { currentJob, jobLog, readHistory, takeConsoleRefresh } from '@/lib/jobs';
import { PURGE } from '@/lib/tags';
import { revalidateTag } from 'next/cache';

/**
 * How much of the log one poll carries, and the only place that number lives.
 *
 * The panel shows a tail, and a job that has been running for an hour must not
 * be answered with an hour of it. It used to be 200 here while `LogTail` drew
 * the last 24 of them — so seven lines in eight were fetched once a second, for
 * as long as a job ran, and then dropped on arrival. The component now renders
 * what it is given (see components/LogTail.tsx), which makes this figure the
 * lines on the wire AND the lines in the DOM rather than a ceiling above a
 * second, smaller ceiling nothing pinned to it.
 *
 * `jobLog` reads this many lines off the END of the file, so the cost of a poll
 * no longer grows with the log it is watching (see lib/jobs.ts).
 */
const TAIL_LINES = 24;

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
 *
 * It also carries the console's cache purge, which looks out of place here and
 * is not. A job's writes happen in a detached tail with no request on the stack,
 * and `revalidateTag` outside a request appends to an array nobody will drain
 * again (see `markConsoleStale` in lib/jobs.ts). This handler is the first real
 * request after any job ends — the console polls it once a second — and it is
 * the very response that tells the client to re-read the page, so the purge and
 * the refresh it exists for cannot get out of order.
 */
export async function GET(): Promise<Response> {
  const { dir, isSample } = await resolveDataDir();

  // Ahead of the answer below, not after it: Next drains this request's tags
  // through `pendingWaitUntil` once the handler returns, and the client's
  // `router.refresh()` cannot arrive before then — it is a whole round trip
  // behind the response this call is still assembling. The same ordering the
  // delete and prune routes have always relied on.
  for (const tag of takeConsoleRefresh(dir)) revalidateTag(tag, PURGE);

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
