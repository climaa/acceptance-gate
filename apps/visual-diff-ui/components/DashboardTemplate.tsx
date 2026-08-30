import type { ReactNode } from 'react';
import { EmptyState, Stack } from '@gate/ui';
import type { CanonicalSet as Corpus } from '@/lib/baselines';
import type { ReportListEntry } from '@/lib/data';
import type { HistoryRecord } from '@/lib/job-contract';
import { formatDay } from '@/lib/outcome';
import type { CaptureSet } from '@/lib/summary';
import { CanonicalSet } from './CanonicalSet';
import { ComparePickers } from './ComparePickers';
import { CurrentJob, CurrentJobProvider } from './CurrentJob';
import { HistoryTable } from './HistoryTable';
import { ReportsTable } from './ReportsTable';
import { RetentionControl } from './RetentionControl';
import { RunPanel } from './RunPanel';
import { SetsTable } from './SetsTable';

/**
 * The console's read surface: what this instance has captured, what it has
 * compared, and what it has run.
 *
 * Synchronous and props-only, deliberately — the page above resolves the data
 * directory and awaits the readers, so everything here is testable without a
 * filesystem, and the panels can be rendered from literal rows.
 *
 * Two columns on the desktop board (sets and reports left, jobs and history
 * right) and one below 768 px. The right column is the write half: start a job,
 * watch it, and the history of everything that has run.
 */

export interface DashboardTemplateProps {
  sets: readonly CaptureSet[];
  /** Bytes on disk per set label — measured, not recorded (see lib/data.ts). */
  sizes: Readonly<Record<string, number>>;
  reports: readonly ReportListEntry[];
  history: readonly HistoryRecord[];
  /** Resolved server-side (lib/data.ts). An instance with no data directory is
   *  serving this repo's committed fixtures, and every mutating route refuses it
   *  with `SAMPLE_DATA` — so the run panel disables every start control, and this
   *  is half of `frozen` below, which takes the deletes and the prune off the
   *  page too. */
  isSample: boolean;
  /** Resolved server-side from the request's own host (lib/local.ts). False on a
   *  deployment, where the run panel offers no start control at all — a job needs
   *  the checkout it compares — and where every mutating route answers
   *  `NOT_LOCAL`. The other half of `frozen` below. */
  isLocal: boolean;
  /** The committed baseline corpus, when there is a checkout to read one from.
   *  Drawn above the captured sets and offered to the compare pickers — it is not
   *  one of them (lib/baselines.ts says why). */
  corpus: Corpus | null;
  /** The job holding the lock as the page rendered, or null. The one fact that
   *  separates a running history row from an interrupted one — see
   *  HistoryTable.tsx. */
  runningId: string | null;
}

interface PanelProps {
  id: string;
  title: string;
  /** Drawn beside the title, as the board does: how many rows are below. Absent
   *  on a panel that holds a control rather than a list. */
  count?: number;
  children: ReactNode;
}

/**
 * One titled region. `aria-labelledby` rather than a bare `<section>`: a named
 * region is a landmark a screen-reader user can jump between, and the shell's
 * `h1` is the wordmark, so every panel title here is an `h2`.
 */
function Panel({ id, title, count, children }: PanelProps) {
  // The landmark is the element, not the Stack: `Stack` forwards no ARIA
  // attributes — it takes the props it lays out and nothing else — so the
  // section owns the name and the Stack inside it owns the spacing.
  return (
    <section aria-labelledby={id} className="vd-panel">
      <Stack gap={4}>
        <h2 className="vd-panel__title" id={id}>
          {title} {count !== undefined && <span className="vd-count">({count})</span>}
        </h2>
        {children}
      </Stack>
    </section>
  );
}

/**
 * When each report's run finished, by report id, as `YYYY-MM-DD`.
 *
 * History is the only thing that knows: `summary.json` carries no timestamp,
 * and a file's mtime is when this disk received the tree rather than when the
 * differ wrote it — which for the committed sample is the moment of a deploy.
 * Newest first in the file, so the first match is the latest run that produced
 * the report; an id nothing claims is simply absent.
 */
function reportDates(history: readonly HistoryRecord[]): Record<string, string> {
  const dates: Record<string, string> = {};

  for (const run of history) {
    if (run.reportId && run.endedAt && !(run.reportId in dates)) {
      // Local, like the HISTORY stamp beside it: both columns describe the
      // same runs, so a run that ended at 01:00 local must not sit under today
      // in one panel and yesterday in the other.
      dates[run.reportId] = formatDay(run.endedAt);
    }
  }

  return dates;
}

export function DashboardTemplate({
  sets,
  sizes,
  reports,
  history,
  isSample,
  isLocal,
  corpus,
  runningId,
}: DashboardTemplateProps) {
  // Newest first, with the corpus at the head: a compare is nearly always "what
  // did my capture do to the corpus", so it is the first thing either picker
  // offers.
  const compareLabels = [
    ...(corpus ? [corpus.label] : []),
    ...sets.map((set) => set.label),
  ];

  // The reports that exist right now, for the history panel. Built from the
  // same list the reports panel draws rather than read again, so a `view` link
  // in one column cannot promise something the other column says is gone —
  // see HistoryTable.tsx for what the two disagreeing looked like.
  const reportIds = new Set(reports.map((report) => report.id));

  // Whether this console can change anything at all, named once and passed down
  // rather than re-derived at each destructive control. Two consoles cannot: a
  // deployed one, which every mutating route refuses with `NOT_LOCAL`, and one
  // with no data directory behind it, which they refuse with `SAMPLE_DATA`
  // because the committed fixtures are this repo's files and not an instance's
  // state. `RunPanel` computes the same thing under the name `frozen`; it takes
  // both halves because it also says which of the two it is, in different words.
  const frozen = isSample || !isLocal;

  return (
    <div className="vd-console">
      <Stack gap={6} className="vd-console__column">
        <Panel id="vd-sets" title="screenshot sets" count={sets.length}>
          {corpus && <CanonicalSet corpus={corpus} />}

          {sets.length === 0 ? (
            <EmptyState message="This instance has captured nothing yet — run a capture and the set appears here." />
          ) : (
            <SetsTable sets={sets} sizes={sizes} frozen={frozen} />
          )}

          {/* The pickers list the corpus alongside the captured sets, which is what
              it is there for. `RetentionControl` does not: pruning is about what
              this instance accumulated, and the corpus is not prunable — the
              delete route refuses it by name.

              The pickers stay wherever there is something to compare — comparing
              is reading, and that is what a deployed or sample console is for.
              The prune does not: `POST /api/prune` refuses both, and this is the
              only bulk destruction here, so rather than a disabled button the
              whole control goes — a keep-latest number with no prune behind it
              states a retention policy the console cannot carry out. */}
          {compareLabels.length > 1 && <ComparePickers labels={compareLabels} />}
          {!frozen && sets.length > 0 && (
            <RetentionControl labels={sets.map((set) => set.label)} />
          )}
        </Panel>

        <Panel id="vd-reports" title="reports" count={reports.length}>
          {reports.length === 0 ? (
            <EmptyState message="No reports yet — compare two capture sets and one appears here." />
          ) : (
            <ReportsTable
              reports={reports}
              dates={reportDates(history)}
              frozen={frozen}
            />
          )}
        </Panel>
      </Stack>

      {/* One poller for the column: the run panel and the current-job region ask
          the same endpoint the same question, and two of them would be two
          consoles disagreeing about whether anything is running. */}
      <CurrentJobProvider>
        <Stack gap={6} className="vd-console__column">
          <Panel id="vd-run" title="start a job">
            <RunPanel isSample={isSample} isLocal={isLocal} />
          </Panel>

          {/* Not wrapped in `Panel`: this region owns a live region and an
              accessible name the acceptance scenarios pin, so it brings its own
              section — see CurrentJob.tsx. */}
          <CurrentJob />

          <Panel id="vd-history" title="history" count={history.length}>
            {history.length === 0 ? (
              <EmptyState message="Nothing has run yet — this instance keeps a row per job." />
            ) : (
              <HistoryTable runs={history} runningId={runningId} reportIds={reportIds} />
            )}
          </Panel>
        </Stack>
      </CurrentJobProvider>
    </div>
  );
}
