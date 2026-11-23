import { CodeBlock, EmptyState } from '@gate/ui';
import type { HomeView } from '@/lib/home.ts';

/** The line under the title once something is measured. */
export const SUBTITLE =
  "What this repository's tests, stories, scenarios and code health cover, and every gap left to file.";

export const MEASURE_COMMAND = 'pnpm census:measure';

export interface HomeScreenProps {
  view: HomeView;
}

/** `/`: the title, and with nothing measured the one thing to do about it. */
export function HomeScreen({ view }: HomeScreenProps) {
  return (
    <main className="census-main">
      <div className="census-intro">
        <h1 className="census-title">Census</h1>
        {view.state === 'measured' && (
          <>
            <p className="census-subtitle">{SUBTITLE}</p>
            <p className="census-tools">{view.meta.tools.join(' · ')}</p>
          </>
        )}
      </div>
      {view.state === 'empty' && (
        <EmptyState
          className="census-empty"
          message={
            <>
              <span className="census-empty__title">No measurement yet</span>
              <span className="census-empty__body">
                Nothing has been measured in this repository. Run the measure step and
                commit the file it writes.
              </span>
            </>
          }
          action={<CodeBlock>{MEASURE_COMMAND}</CodeBlock>}
        />
      )}
    </main>
  );
}
