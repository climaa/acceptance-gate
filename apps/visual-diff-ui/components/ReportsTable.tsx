import NextLink from 'next/link';
import { Link, Table, type TableColumn, type TableRow } from '@gate/ui';
import { DeleteReportButton } from './ConfirmDialogs';
import type { ReportListEntry } from '@/lib/data';

/**
 * The comparisons this instance has written, newest first.
 *
 * A row is the id, when the run that produced it finished, and a delete. Built
 * as data rather than as a component — see SetsTable.tsx for why.
 *
 * The delete was drawn here disabled long before it was wired, on the argument
 * that a report row without a button would read as an omission beside a sets
 * table that has one. That was the right shape and the wrong control: a red
 * destructive button which takes the click and does nothing is, from the
 * reviewer's side, indistinguishable from a delete that silently failed. It is
 * live now, behind the confirmation D2 requires.
 *
 * It is absent rather than disabled on any console that cannot mutate, which is
 * the rule the run panel already keeps. Two consoles cannot: a deployed one, and
 * one serving the committed fixtures because no data directory was configured.
 * Both refuse the request at the route — `NOT_LOCAL` and `SAMPLE_DATA` — and a
 * button whose only outcome is a refusal is an invitation to look for the way to
 * enable it.
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

function reportRow(
  report: ReportListEntry,
  date: string | null,
  frozen: boolean,
): TableRow {
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
      frozen ? null : <DeleteReportButton id={report.id} key="delete" />,
    ],
  };
}

export interface ReportsTableProps {
  reports: readonly ReportListEntry[];
  /** When each report's run finished, by report id. Sparse on purpose: a report
   *  whose run is not in this history has no date this instance can vouch for. */
  dates: Readonly<Record<string, string>>;
  /** Whether this console can change anything at all — `isSample || !isLocal`,
   *  derived once by `DashboardTemplate` rather than twice here and in
   *  `SetsTable`. A frozen one draws no delete at all; see the header. */
  frozen: boolean;
}

export function ReportsTable({ reports, dates, frozen }: ReportsTableProps) {
  return (
    <Table
      label={REPORTS_TABLE_LABEL}
      columns={REPORT_COLUMNS}
      rows={reports.map((report) => reportRow(report, dates[report.id] ?? null, frozen))}
    />
  );
}
