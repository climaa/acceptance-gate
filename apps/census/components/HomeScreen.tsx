import { CodeBlock, EmptyState } from '@gate/ui';
import { NO_FILTER, type HomeFilter } from '@/lib/filter.ts';
import type { HomeView } from '@/lib/home.ts';
import { MEASURE_COMMAND } from '@/lib/overview.ts';
import { STALE_AFTER_DAYS } from '@/lib/stale.ts';
import { GapList } from './GapList';
import {
  CodeCoverageCard,
  CoverageCard,
  DeadCodeCard,
  GapPillsCard,
  HealthCard,
  HotspotsCard,
  MetricsCard,
  NotesCard,
  PyramidCard,
  StatesCard,
  StoriesCard,
  StylingCard,
  SummaryCard,
} from './HomeSections';
import { TrendCard } from './TrendCard';

/** The line under the title once something is measured. */
export const SUBTITLE =
  "What this repository's tests, stories, scenarios and code health cover, and every gap left to file.";

export { MEASURE_COMMAND };

export interface HomeScreenProps {
  view: HomeView;
  /** The reader's `?dimension=` / `?category=`; none by default. */
  filter?: HomeFilter;
}

function Empty() {
  return (
    <EmptyState
      className="census-empty"
      message={
        <>
          <span className="census-empty__title">No measurement yet</span>
          <span className="census-empty__body">
            Nothing has been measured in this repository. Run the measure step and commit
            the file it writes.
          </span>
        </>
      }
      action={<CodeBlock>{MEASURE_COMMAND}</CodeBlock>}
    />
  );
}

/** `/`: the title, then the measured home in the board's order, or the one thing to do about nothing measured. */
export function HomeScreen({ view, filter = NO_FILTER }: HomeScreenProps) {
  if (view.state === 'empty') {
    return (
      <main className="census-main">
        <div className="census-intro">
          <h1 className="census-title">Census</h1>
        </div>
        <Empty />
      </main>
    );
  }
  const { overview: o, meta } = view;
  return (
    <main className="census-main">
      <div className="census-intro">
        <h1 className="census-title">Census</h1>
        <p className="census-subtitle">{SUBTITLE}</p>
        <p className="census-tools">{meta.tools.join(' · ')}</p>
      </div>
      {meta.staleDays !== null && (
        <p className="census-stale" role="status">
          Measured {meta.staleDays} days ago; the limit is {STALE_AFTER_DAYS}. Run{' '}
          {MEASURE_COMMAND} and commit the file.
        </p>
      )}
      <SummaryCard data={o.summary} />
      <CoverageCard data={o.coverage} filter={filter} />
      <MetricsCard data={o.metrics} />
      <div className="census-bento">
        <PyramidCard data={o.pyramid} />
        <GapPillsCard data={o.gapPills} />
      </div>
      <StoriesCard data={o.stories} />
      <StatesCard data={o.states} />
      <TrendCard series={o.trend} />
      <HealthCard data={o.health} />
      <DeadCodeCard data={o.dead} />
      <StylingCard data={o.styling} />
      <HotspotsCard data={o.hotspots} />
      <CodeCoverageCard data={o.codeCoverage} />
      <GapList gaps={o.gaps} filter={filter} />
      <NotesCard notes={o.notes} rerun={o.rerun} exports={o.exports} />
    </main>
  );
}
