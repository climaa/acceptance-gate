import type { ReportListEntry } from '@/lib/data';
import { REPORT_COLUMNS, reportRow } from './ReportRow';
import { Table } from './Table';

const REPORTS_TABLE_LABEL = 'Reports';

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
