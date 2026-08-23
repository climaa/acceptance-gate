import { test as base } from 'playwright-bdd';

import { BlogIndexPage } from '../../pages/blog-index';
import { Chrome } from '../../pages/chrome';
import { ComparisonModal } from '../../pages/comparison-modal';
import { ConsolePage } from '../../pages/console';
import { PostPage } from '../../pages/post';
import { ReportPage } from '../../pages/report';

/** What one scenario's steps hand each other — e.g. the title read off the index
 *  before the click that navigates away from it. A plain object, not a return
 *  value: playwright-bdd steps take fixtures, not each other's results. */
export interface ScenarioState {
  articleTitle?: string;
  /** How many variants were marked reviewed before the step that marks one. */
  reviewedBefore?: number;
  /** Which report an accept scenario is about, when it is not the one the
   *  console's picker opens on. */
  acceptReport?: string;
}

/** Page objects reach the steps as fixtures, never as `new` inside a step: two steps
 *  in one scenario then share the instance instead of building it twice, and a step
 *  file's imports stay the pages it actually drives. Every later scenario extends this
 *  one object.
 *
 *  It lives under `steps/acceptance/` because that is where `bddgen` looks for the
 *  extended `test` instance — the `steps` glob in playwright.config.ts is the only place
 *  it scans, and it names the lane rather than the layer root so these specs can never
 *  bind to the local lane's `test` (whose page objects point at the dev server on 3300). */
export const test = base.extend<{
  blogIndex: BlogIndexPage;
  post: PostPage;
  chrome: Chrome;
  console: ConsolePage;
  report: ReportPage;
  modal: ComparisonModal;
  scenarioState: ScenarioState;
}>({
  blogIndex: async ({ page }, use) => {
    await use(new BlogIndexPage(page));
  },
  post: async ({ page }, use) => {
    await use(new PostPage(page));
  },
  chrome: async ({ page }, use) => {
    await use(new Chrome(page));
  },
  console: async ({ page }, use) => {
    await use(new ConsolePage(page));
  },
  report: async ({ page }, use) => {
    await use(new ReportPage(page));
  },
  modal: async ({ page }, use) => {
    await use(new ComparisonModal(page));
  },
  scenarioState: async ({}, use) => {
    await use({});
  },
});
