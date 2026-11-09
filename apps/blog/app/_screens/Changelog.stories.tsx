import { ChangelogScreen, type ChangelogRelease } from '@/components/ChangelogScreen';
import { inBlog } from './frame';

/** `/changelog`: the releases, with the control that opens their conversations
 *  beside them. Baselined, as a screen is, at both viewports. */
const meta = {
  title: 'Screens/Blog/Changelog',
  component: ChangelogScreen,
  parameters: { screen: { routes: ['/changelog'] } },
};

export default meta;

const REPO = 'https://github.com/climaa/acceptance-gate';

/**
 * Two releases as the page draws them, one titled and one bare. Written out
 * rather than fetched: the route asks GitHub at build time, which a story cannot,
 * and a live list would change every baseline on every release. The bodies are
 * the elements the route's markdown pipeline produces.
 */
const RELEASES: readonly ChangelogRelease[] = [
  {
    tag: 'v1.8.0',
    title: 'every page is a screen',
    date: '2026-11-09',
    displayDate: 'November 9, 2026',
    url: `${REPO}/releases/tag/v1.8.0`,
    body: (
      <>
        <h2>What changed</h2>
        <ul>
          <li>The blog and the manual are photographed whole, route by route.</li>
          <li>A page with no screen story fails the gate.</li>
        </ul>
      </>
    ),
  },
  {
    tag: 'v1.7.0',
    title: null,
    date: '2026-10-21',
    displayDate: 'October 21, 2026',
    url: `${REPO}/releases/tag/v1.7.0`,
    body: <p>The console names its project in the header and the tab.</p>,
  },
];

export const Releases = {
  args: { releases: RELEASES },
  ...inBlog('/changelog'),
};
