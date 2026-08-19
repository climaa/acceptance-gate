import NextLink from 'next/link';
import { Link, Table, type TableColumn, type TableRow } from '@gate/ui';
import type { HistoryRecord } from '@/lib/jobs';
import { durationOf, formatDuration, outcomeOf, outcomeTone } from '@/lib/outcome';

/**
 * The past runs, newest first — the order `history.json` is written in.
 *
 * The status word and its colour are both derived from the recorded exit code
 * (lib/outcome.ts), never stored: a verdict on file can disagree with the code
 * printed in the cell beside it.
 *
 * The row is built as data rather than as a component — see SetsTable.tsx for
 * why.
 */

const HISTORY_TABLE_LABEL = 'History';

/** What a run that never reported has instead of a number. An interrupted job
 *  keeps its nulls (see lib/jobs.ts) and this is them, said out loud. */
const NOTHING = '—';

const HISTORY_COLUMNS: readonly TableColumn[] = [
  { header: 'status' },
  { header: 'type' },
  { header: 'started' },
  { header: 'exit', numeric: true },
  { header: 'took', numeric: true },
  { header: '' },
];

function historyRow(run: HistoryRecord): TableRow {
  const outcome = outcomeOf(run.exitCode);
  const took = durationOf(run.startedAt, run.endedAt);

  return {
    key: run.id,
    cells: [
      <span className={`vd-outcome vd-outcome--${outcomeTone(outcome)}`} key="status">
        {outcome}
      </span>,
      run.mode,
      { content: run.startedAt, title: run.startedAt },
      run.exitCode ?? NOTHING,
      took === null ? NOTHING : formatDuration(took),
      // A capture writes no report, and an interrupted run never got to. The
      // cell stays empty rather than offering a link into a 404.
      run.reportId ? (
        <Link as={NextLink} href={`/report/${run.reportId}`} key="view">
          view
        </Link>
      ) : null,
    ],
  };
}

export interface HistoryTableProps {
  runs: readonly HistoryRecord[];
}

export function HistoryTable({ runs }: HistoryTableProps) {
  return (
    <Table
      label={HISTORY_TABLE_LABEL}
      columns={HISTORY_COLUMNS}
      rows={runs.map(historyRow)}
    />
  );
}
