import { test as base } from 'playwright-bdd';

import { BlogIndexPage } from '../pages/blog-index';

/** Page objects reach the steps as fixtures, never as `new` inside a step: two steps
 *  in one scenario then share the instance instead of building it twice, and a step
 *  file's imports stay the pages it actually drives. Every later scenario extends this
 *  one object.
 *
 *  It lives under `steps/` because that is where `bddgen` looks for the extended `test`
 *  instance — the `steps` glob in playwright.config.ts is the only place it scans. */
export const test = base.extend<{ blogIndex: BlogIndexPage }>({
  blogIndex: async ({ page }, use) => {
    await use(new BlogIndexPage(page));
  },
});
