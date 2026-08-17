import type { ReactNode } from 'react';
import { EmptyState, Stack } from '@gate/ui';
import type { ReportListEntry } from '@/lib/data';
import type { HistoryRecord } from '@/lib/jobs';
import type { CaptureSet } from '@/lib/summary';
import { ComparePickers } from './ComparePickers';
import { HistoryTable } from './HistoryTable';
import { ReportsTable } from './ReportsTable';
import { RetentionControl } from './RetentionControl';
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
 * right) and one below 768 px. The run panel and the current-job region are a
 * later issue's; the right column holds history alone until they land.
 */

export interface DashboardTemplateProps {
  sets: readonly CaptureSet[];
  /** Bytes on disk per set label — measured, not recorded (see lib/data.ts). */
  sizes: Readonly<Record<string, number>>;
  reports: readonly ReportListEntry[];
  history: readonly HistoryRecord[];
}

interface PanelProps {
  id: string;
  title: string;
  /** Drawn beside the title, as the board does: how many rows are below. */
  count: number;
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
          {title} <span className="vd-count">({count})</span>
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
      dates[run.reportId] = run.endedAt.slice(0, 'YYYY-MM-DD'.length);
    }
  }

  return dates;
}

export function DashboardTemplate({
  sets,
  sizes,
  reports,
  history,
}: DashboardTemplateProps) {
  return (
    <div className="vd-console">
      <Stack gap={6} className="vd-console__column">
        <Panel id="vd-sets" title="snapshot sets" count={sets.length}>
          {sets.length === 0 ? (
            <EmptyState message="This instance has captured nothing yet — run a capture and the set appears here." />
          ) : (
            <>
              <SetsTable sets={sets} sizes={sizes} />
              <ComparePickers labels={sets.map((set) => set.label)} />
              <RetentionControl />
            </>
          )}
        </Panel>

        <Panel id="vd-reports" title="reports" count={reports.length}>
          {reports.length === 0 ? (
            <EmptyState message="No reports yet — compare two capture sets and one appears here." />
          ) : (
            <ReportsTable reports={reports} dates={reportDates(history)} />
          )}
        </Panel>
      </Stack>

      <Stack gap={6} className="vd-console__column">
        <Panel id="vd-history" title="history" count={history.length}>
          {history.length === 0 ? (
            <EmptyState message="Nothing has run yet — this instance keeps a row per job." />
          ) : (
            <HistoryTable runs={history} />
          )}
        </Panel>
      </Stack>
    </div>
  );
}
