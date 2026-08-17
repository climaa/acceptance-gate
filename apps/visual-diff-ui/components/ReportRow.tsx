import NextLink from 'next/link';
import { Button, Link } from '@gate/ui';
import type { ReportListEntry } from '@/lib/data';
import type { TableColumn, TableRow } from './Table';

/**
 * One named comparison as a table row: the id, when the run that produced it
 * finished, and a delete this issue names but does not wire.
 *
 * A row builder rather than a component — see SetRow.tsx for why.
 */

/** A report no run in this instance's history claims: a tree copied in, or a
 *  history file that has since been pruned. The comparison is real, the date is
 *  not this instance's to state. */
const UNDATED = '—';

export const REPORT_COLUMNS: readonly TableColumn[] = [
  { header: 'report', truncate: true },
  { header: 'date' },
  { header: '' },
];

export function reportRow(report: ReportListEntry, date: string | null): TableRow {
  return {
    key: report.id,
    cells: [
      {
        content: (
          <Link as={NextLink} href={`/report/${report.id}`} className="vd-report-id">
            {report.id}
          </Link>
        ),
        title: report.id,
      },
      date ?? UNDATED,
      <Button variant="danger" size="sm" key="delete">
        delete
      </Button>,
    ],
  };
}
