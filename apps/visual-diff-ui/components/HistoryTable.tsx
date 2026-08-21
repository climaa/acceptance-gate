import NextLink from 'next/link';
import { Link, Table, type TableColumn, type TableRow } from '@gate/ui';
import type { HistoryRecord } from '@/lib/jobs';
import { durationOf, formatDuration, jobState } from '@/lib/outcome';

/**
 * The past runs, newest first — the order `history.json` is written in.
 *
 * The status word and its colour are derived from the recorded exit code AND
 * the lock (lib/outcome.ts), never stored: a verdict on file can disagree with
 * the code printed in the cell beside it. The lock is the second half because a
 * running row and an interrupted one carry the same nulls — `startJob` writes
 * them and only the end of the job patches them — so the exit code alone drew
 * every live job as `interrupted`, beside a CURRENT JOB region saying
 * `running`.
 *
 * The row is built as data rather than as a component — see SetsTable.tsx for
 * why.
 */

const HISTORY_TABLE_LABEL = 'History';

/** What a run with no number yet has instead of one. An interrupted job keeps
 *  its nulls (see lib/jobs.ts) and a running job has not written them yet; this
 *  is both, said out loud. */
const NOTHING = '—';

const HISTORY_COLUMNS: readonly TableColumn[] = [
  { header: 'status' },
  { header: 'type' },
  { header: 'started' },
  { header: 'exit', numeric: true },
  { header: 'took', numeric: true },
  // Sized to the control it holds; see SetsTable for why a share of the table is
  // not enough.
  { header: '', width: '6rem' },
];

function historyRow(run: HistoryRecord, runningId: string | null): TableRow {
  const { word, tone } = jobState(run.exitCode, run.id === runningId);
  const took = durationOf(run.startedAt, run.endedAt);

  return {
    key: run.id,
    cells: [
      <span className={`vd-outcome vd-outcome--${tone}`} key="status">
        {word}
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
  /** The job holding `job.lock` right now, or null. Read server-side by
   *  `currentJob()` — see app/page.tsx for why it is read there and not here. */
  runningId: string | null;
}

export function HistoryTable({ runs, runningId }: HistoryTableProps) {
  return (
    <Table
      label={HISTORY_TABLE_LABEL}
      columns={HISTORY_COLUMNS}
      rows={runs.map((run) => historyRow(run, runningId))}
    />
  );
}
