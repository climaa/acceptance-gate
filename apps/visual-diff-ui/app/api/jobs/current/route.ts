import { resolveDataDir } from '@/lib/data';
import {
  ReportIdSchema,
  currentJob,
  hasReport,
  jobLog,
  readHistory,
  takeConsoleRefresh,
} from '@/lib/jobs';
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
 * The answer carries `reportExists` beside the job rather than leaving the
 * client to trust `job.reportId`. The id on a history row is what the run
 * produced, which is not the same claim as "that report is still on disk" — a
 * reviewer can delete it from the reports panel a second after the run ends,
 * and the row keeps the id forever (see lib/jobs.ts's `removeReport`). Answered
 * here because this is the side holding the data directory; the panel has no
 * way to check.
 *
 * The id's SHAPE is checked before the disk is touched, the same order the
 * delete route checks it in and for a sharper reason. `HistoryRecordSchema`
 * types `reportId` as a plain string, so a corrupt or hand-edited history can
 * carry one that climbs out of the data directory — and `hasReport` refuses a
 * climb by THROWING, which here would be a 500 rather than an answer. This is
 * the one route in the console deliberately not gated on localhost, because a
 * deployed console has to poll it, so that throw would take the poll down for
 * everyone looking at it. An id that is not an id simply has no report.
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
      reportExists: hasNamedReport(dir, job?.reportId ?? null),
      log: job ? jobLog(dir, job.id, TAIL_LINES) : [],
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

/** Whether that report is on disk, for an id that may be anything at all. A
 *  shape this console could never have written names no report, rather than
 *  reaching a confinement check that answers by throwing. */
function hasNamedReport(dir: string, reportId: string | null): boolean {
  if (reportId === null || !ReportIdSchema.safeParse(reportId).success) return false;

  return hasReport(dir, reportId);
}
