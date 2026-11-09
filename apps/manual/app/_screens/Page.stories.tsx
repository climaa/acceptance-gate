import { ManualPageScreen } from '@/components/ManualPageScreen';
import { findManualPage } from '@/lib/allowlist';
import { inManual } from './frame';

/**
 * `/[slug]`: one published feature as a manual page. Drawn for `console`, which
 * carries all of what the route renders — the figure in both themes, a
 * precondition list and the scenarios — in seven scenarios rather than `report`'s
 * fifteen, so its screenshot stays under the per-file budget at mobile.
 * Baselined, as a screen is, at both viewports.
 */
const meta = {
  title: 'Screens/Manual/Page',
  component: ManualPageScreen,
  parameters: { screen: { routes: ['/[slug]'] } },
};

export default meta;

const PAGE = findManualPage('console');

if (!PAGE) throw new Error('The manual no longer publishes `console`.');

export const Console = {
  args: { page: PAGE },
  ...inManual(`/${PAGE.slug}`),
};
