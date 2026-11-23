import { HomeScreen } from '@/components/HomeScreen';
import { parseCommitted } from '@/lib/committed.ts';
import { homeView } from '@/lib/home.ts';
import type { HomeFilter } from '@/lib/filter.ts';
import measurement from '../../fixtures/sample/measurement.json';
import history from '../../fixtures/sample/history.json';
import { inCensus } from './frame';

/** `/`: census's front page. Baselined, as a screen is, at both viewports. */
const meta = {
  title: 'Screens/Census/Home',
  component: HomeScreen,
  parameters: { screen: { routes: ['/'] } },
};

export default meta;

/** Nothing committed: what a repository shows before its first
 *  `pnpm census:measure`. The clock is unread, since nothing is dated. */
const EMPTY = homeView({ state: 'empty' }, 0);

export const Empty = {
  ...inCensus(EMPTY, '/'),
  args: { view: EMPTY },
};

/** The sample measurement read as the build reads it, through the validators. */
const committed = (over: { commit?: string; measuredAt?: string } = {}) =>
  parseCommitted({
    measurement: JSON.stringify({ ...measurement, ...over }),
    history: JSON.stringify(history),
  });

/** The build's clock for both measured stories: the evening of 20 Nov 2026, the sample's day. */
const BUILT = Date.parse('2026-11-20T20:00:00.000Z');

/** `fixtures/sample/`, measured the day the page was built. */
const SAMPLE = homeView(committed(), BUILT);

export const Sample = {
  ...inCensus(SAMPLE, '/'),
  args: { view: SAMPLE },
};

/** `?dimension=code`: Code lit, the other dimensions dimmed, the gaps narrowed to Code. */
const CODE: HomeFilter = { dimension: 'code', category: null };

export const Filtered = {
  ...inCensus(SAMPLE, '/', CODE),
  args: { view: SAMPLE, filter: CODE },
};

/** The same figures measured 21 days before the build, past the 14-day limit. The
 *  history is the sample's: only the measurement's own commit and date move. */
const STALE = homeView(
  committed({
    commit: '39c9294e1d7a5b3f2c8e6a4d0b9f7e5c3a1d8b6f',
    measuredAt: '2026-10-30T17:42:00.000Z',
  }),
  BUILT,
);

export const Stale = {
  ...inCensus(STALE, '/'),
  args: { view: STALE },
};
