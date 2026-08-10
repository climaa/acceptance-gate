import type { Locator, Page } from '@playwright/test';

/** A single article at `/blog/[slug]`. Reached only through the index's own
 *  link — a step never navigates here by slug. */
export class PostPage {
  readonly mainHeading: Locator;
  /** The rendered MDX body — `PostTemplate` wraps it in the page's one
   *  `<article>`, so scoping through that role rules out any other prose
   *  block ever appearing on the page. */
  readonly body: Locator;

  constructor(page: Page) {
    this.mainHeading = page.getByRole('heading', { level: 1 });
    this.body = page.getByRole('article').locator('.ds-prose');
  }
}
