import type { Locator, Page } from '@playwright/test';

/** A single article at `/blog/[slug]`. Reached only through the index's own
 *  link — a step never navigates here by slug. */
export class PostPage {
  readonly mainHeading: Locator;
  /** The rendered MDX body — `PostTemplate` wraps it in the page's one
   *  `<article>`, so scoping through that role rules out any other prose
   *  block ever appearing on the page. */
  readonly body: Locator;
  /** The article's highlighted code slabs. Selected on `data-language` rather
   *  than by role, for the reason `blog-index.ts` selects `<time>` by tag:
   *  `pre` maps to no ARIA role, so there is none to ask for. The attribute is
   *  `CodeBlock`'s own contract with the rehype pipeline, pinned by
   *  apps/blog/__tests__/content.test.ts, so it is a stabler handle than the
   *  class beside it. */
  readonly codeBlocks: Locator;

  constructor(page: Page) {
    this.mainHeading = page.getByRole('heading', { level: 1 });
    this.body = page.getByRole('article').locator('.ds-prose');
    this.codeBlocks = this.body.locator('pre[data-language]');
  }
}
