import NextLink from 'next/link';
import { Button, Link, Table, type TableColumn, type TableRow } from '@gate/ui';
import type { ReportListEntry } from '@/lib/data';

/**
 * The comparisons this instance has written, newest first.
 *
 * A row is the id, when the run that produced it finished, and a delete this
 * issue names but does not wire. Built as data rather than as a component — see
 * SetsTable.tsx for why.
 *
 * Present and disabled, which is the answer `CanonicalSet` already gives one
 * panel over — and the reason it gives is the same one: the sets table below
 * carries a live delete on every row, so a report row without a button would
 * read as an omission rather than as a rule. Enabled was the one answer that
 * could not be right. A red destructive control that takes the click and does
 * nothing is indistinguishable, from the reviewer's side, from a delete that
 * silently failed.
 */

const REPORTS_TABLE_LABEL = 'Reports';

/** A report no run in this instance's history claims: a tree copied in, or a
 *  history file that has since been pruned. The comparison is real, the date is
 *  not this instance's to state. */
const UNDATED = '—';

const REPORT_COLUMNS: readonly TableColumn[] = [
  { header: 'report', truncate: true },
  { header: 'date' },
  // Sized to the button it holds; see SetsTable for why a share of the table is
  // not enough.
  { header: '', width: '6rem' },
];

function reportRow(report: ReportListEntry, date: string | null): TableRow {
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
      <Button variant="danger" size="sm" key="delete" disabled>
        delete
      </Button>,
    ],
  };
}

export interface ReportsTableProps {
  reports: readonly ReportListEntry[];
  /** When each report's run finished, by report id. Sparse on purpose: a report
   *  whose run is not in this history has no date this instance can vouch for. */
  dates: Readonly<Record<string, string>>;
}

export function ReportsTable({ reports, dates }: ReportsTableProps) {
  return (
    <Table
      label={REPORTS_TABLE_LABEL}
      columns={REPORT_COLUMNS}
      rows={reports.map((report) => reportRow(report, dates[report.id] ?? null))}
    />
  );
}
