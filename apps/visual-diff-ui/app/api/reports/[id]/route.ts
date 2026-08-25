import { revalidateTag } from 'next/cache';
import { readReport, resolveDataDir } from '@/lib/data';
import { guardMutation } from '@/lib/guard';
import { PURGE, REPORTS_TAG, reportTag } from '@/lib/tags';
import { hasReport, removeReport } from '@/lib/jobs';
import { ReportIdSchema } from '@/lib/job-contract';
import { notFound } from '@/lib/refusals';

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
 * `guardMutation` is the same gauntlet the other three mutations run, in the
 * same order, and its local gate carries a different argument here than it does
 * on `POST /api/jobs`. A job is refused off-localhost because it needs the
 * checkout it compares; a delete needs no checkout, and is refused because a
 * deployed console pointed at a real data directory would otherwise let anyone
 * who can reach it destroy the record of every comparison on it. The panel hides
 * the button off localhost; the guard is what makes that a rule rather than a
 * decoration.
 *
 * That the two arguments now reach one function is the point of it: this route
 * was the only delete keeping the rule for a while, because `DELETE
 * /api/sets/[label]` and `POST /api/prune` were written before the gate existed
 * and did not get it when this route did.
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
  const gate = await guardMutation();
  if (gate instanceof Response) return gate;
  const { dir } = gate;

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
