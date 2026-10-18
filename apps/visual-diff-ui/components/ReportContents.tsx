import { notFound } from 'next/navigation';
import { readCanonicalSet } from '@/lib/baselines';
import { readReport, readSets, resolveDataDir } from '@/lib/data';
import { repoRoot } from '@/lib/git';
import { ReportTemplate } from './ReportTemplate';

/**
 * One report, read and handed to the template — what both the report route and
 * a comparison's own page draw, since a comparison loaded cold is its report
 * with the modal already open over it.
 *
 * A report id that never existed, and one that climbed out of the data
 * directory, land on `notFound()` the same way: nothing to show, nothing to say
 * about why. lib/data.ts refuses the second before any file is opened.
 */
export async function ReportContents({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { dir } = await resolveDataDir();
  // The corpus too: a `baselines` side is not in the capture registry, and the
  // header names it from here instead of calling it missing.
  const [report, registry, corpus] = await Promise.all([
    readReport(dir, id),
    readSets(dir),
    readCanonicalSet(repoRoot()),
  ]);

  if (!report) notFound();

  return <ReportTemplate id={id} report={report} sets={registry.sets} corpus={corpus} />;
}
