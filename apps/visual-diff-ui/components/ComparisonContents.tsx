import { notFound } from 'next/navigation';
import { readComparison } from '@/lib/comparison-meta';
import { resolveDataDir } from '@/lib/data';
import { reportSides } from '@/lib/report-view';
import { type ComparisonEntry, ComparisonRoute } from './ComparisonRoute';

/**
 * One comparison, read and handed to the modal.
 *
 * `notFound()` for a key the report does not hold, so the dialog is only ever
 * drawn over a variant that exists — never opened blank. On a cold load the
 * proxy has already answered that miss with a real 404; this is the same answer
 * for the two paths the proxy does not see: a deployment shipped without its
 * reports tree, and an in-app navigation.
 */
export async function ComparisonContents({
  params,
  entry,
}: {
  params: Promise<{ id: string; key: string }>;
  entry: ComparisonEntry;
}) {
  const { id, key } = await params;
  const { dir } = await resolveDataDir();
  const comparison = await readComparison(dir, id, key);
  if (!comparison) notFound();

  return (
    <ComparisonRoute
      reportId={id}
      variants={comparison.variants}
      sides={reportSides(id)}
      entry={entry}
    />
  );
}
