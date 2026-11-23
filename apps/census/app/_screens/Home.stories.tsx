import { HomeScreen } from '@/components/HomeScreen';
import { homeView } from '@/lib/home.ts';
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
