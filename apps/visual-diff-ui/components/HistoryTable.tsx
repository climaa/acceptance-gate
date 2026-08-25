import NextLink from 'next/link';
import { Link, Table, type TableColumn, type TableRow } from '@gate/ui';
import type { HistoryRecord } from '@/lib/job-contract';
import { durationOf, formatDuration, formatStamp, jobState } from '@/lib/outcome';
import { OutcomeWord } from './OutcomeWord';

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
 *
 * The `view` cell is gated on the reports that exist RIGHT NOW, not on the id
 * the row happens to carry. History is append-only and `removeReport` deletes a
 * tree without touching it (lib/jobs.ts), so a reviewer who deletes a report
 * leaves every row that produced it still naming it — and every one of those
 * links lands on a 404. Reconciled here rather than by patching the row,
 * because the directory is the source of truth everywhere else in this app
 * (lib/data.ts's `listReportIds` walks it), and a report removed by hand,
 * outside the console, has to disappear from this column too.
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

function historyRow(
  run: HistoryRecord,
  runningId: string | null,
  reportIds: ReadonlySet<string>,
): TableRow {
  const { word, tone } = jobState(run.exitCode, run.id === runningId);
  const took = durationOf(run.startedAt, run.endedAt);

  return {
    key: run.id,
    cells: [
      <OutcomeWord word={word} tone={tone} key="status" />,
      run.mode,
      // Two clocks, deliberately. The cell is the reader's own — a row is read
      // against the clock in their menubar — and the title is the stored
      // instant, `Z` and all, which is the only place the absolute moment is
      // still legible. See formatStamp in lib/outcome.ts for why the split.
      { content: formatStamp(run.startedAt), title: run.startedAt },
      run.exitCode ?? NOTHING,
      took === null ? NOTHING : formatDuration(took),
      // A capture writes no report, an interrupted run never got to, and a
      // deleted one no longer has the tree its id names. The cell stays empty
      // rather than offering a link into a 404.
      run.reportId && reportIds.has(run.reportId) ? (
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
  /** The ids of the reports this instance still has, which is what decides
   *  whether a row gets a `view` link. Derived by the caller from the same list
   *  the reports panel draws, so the two panels cannot disagree about which
   *  reports exist. */
  reportIds: ReadonlySet<string>;
}

export function HistoryTable({ runs, runningId, reportIds }: HistoryTableProps) {
  return (
    <Table
      label={HISTORY_TABLE_LABEL}
      columns={HISTORY_COLUMNS}
      rows={runs.map((run) => historyRow(run, runningId, reportIds))}
    />
  );
}
