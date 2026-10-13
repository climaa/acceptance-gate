import { notFound } from 'next/navigation';
import { readReport, readSets, resolveDataDir } from '@/lib/data';
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
  const [report, registry] = await Promise.all([readReport(dir, id), readSets(dir)]);

  if (!report) notFound();

  return <ReportTemplate id={id} report={report} sets={registry.sets} />;
}
