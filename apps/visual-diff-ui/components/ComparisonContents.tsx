import { notFound } from 'next/navigation';
import { readBoardHomes } from '@/lib/board-homes';
import { readComparison } from '@/lib/comparison-meta';
import { resolveDataDir } from '@/lib/data';
import { readLedgerReport } from '@/lib/ledger';
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
 *
 * The readings come down the same way, read HERE rather than fetched from the
 * panel: one read on the server serves both ways in — the intercepted modal and
 * the cold load — so the design view needs no API route of its own. A
 * comparison with no ledger report reads as null, which is a panel saying so
 * rather than a request that 404s.
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
      ledger={await readLedgerReport(id, key)}
      homes={await readBoardHomes()}
      entry={entry}
    />
  );
}
