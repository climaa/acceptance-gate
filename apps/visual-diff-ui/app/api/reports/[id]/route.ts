import { headers } from 'next/headers';
import { revalidateTag } from 'next/cache';
import { readReport, resolveDataDir } from '@/lib/data';
import { PURGE, REPORTS_TAG, reportTag } from '@/lib/tags';
import { ReportIdSchema, hasReport, removeReport } from '@/lib/jobs';
import { isLocalHost } from '@/lib/local';
import {
  NOT_LOCAL,
  SAMPLE_DATA,
  conflict,
  notFound,
  refuseWhileRunning,
} from '@/lib/refusals';

interface Context {
  params: Promise<{ id: string }>;
}

/** One report's validated `summary.json`. */
export async function GET(_request: Request, { params }: Context): Promise<Response> {
  const { id } = await params;
  const { dir, isSample } = await resolveDataDir();
  const report = await readReport(dir, id);

  // Unknown and refused answer alike: an id that climbs out of the data
  // directory is not a different kind of miss, and saying so would confirm what
  // is on the disk above it.
  if (!report) return Response.json({ error: 'no such report' }, { status: 404 });

  return Response.json({ isSample, report });
}

/**
 * Delete one comparison report.
 *
 * The same gauntlet the other three mutations run, in the same order, and the
 * local gate is the one worth naming. `POST /api/jobs` has always refused a
 * request that did not come from the machine running the console, because a job
 * needs the checkout; a delete needs no checkout, so this is a different
 * argument for the same rule — a deployed console pointed at a real data
 * directory would otherwise let anyone who can reach it destroy the record of
 * every comparison on it. The panel hides the button off localhost; this is what
 * makes that a rule rather than a decoration.
 *
 * It was the only delete keeping that rule for a while. `DELETE /api/sets/[label]`
 * and `POST /api/prune` were written before the gate existed and did not get it
 * when this route did, which is why the sentence above says "the other three"
 * now and said "the other two" before.
 *
 * The id's SHAPE is checked before anything reads it, exactly as the sets route
 * checks a label's: an id that is not an id is a miss rather than a refusal,
 * because answering anything else would confirm what the shape of a real one
 * is. It also keeps `reportDir`'s confinement check from being reached by a
 * segment that climbs out — `within` throws there, and a throw is a 500 where
 * this wants a 404.
 *
 * `hasReport` rather than a bare `rmSync`: `force` makes removing nothing
 * indistinguishable from removing something, and "deleted" over a report that
 * was never there is a worse answer than a miss.
 */
export async function DELETE(_request: Request, { params }: Context): Promise<Response> {
  const { id } = await params;
  const { dir, isSample } = await resolveDataDir();
  if (isSample) return conflict(SAMPLE_DATA);

  if (!isLocalHost((await headers()).get('host'))) return conflict(NOT_LOCAL);

  const busy = refuseWhileRunning(dir);
  if (busy) return busy;

  if (!ReportIdSchema.safeParse(id).success || !hasReport(dir, id)) {
    return notFound(`no report at reports/${id}`);
  }

  removeReport(dir, id);
  // Both handles this moved: the list a reviewer is looking at, and the report
  // page's own entry — which would otherwise go on serving a summary whose
  // directory is gone.
  revalidateTag(REPORTS_TAG, PURGE);
  revalidateTag(reportTag(id), PURGE);

  return Response.json({ removed: id });
}
