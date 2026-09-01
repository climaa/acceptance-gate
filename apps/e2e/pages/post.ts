import type { Locator, Page, Response } from '@playwright/test';

/** A single article at `/blog/[slug]`. Reached only through the index's own
 *  link — a step never navigates here by slug, with the one exception below. */
export class PostPage {
  readonly mainHeading: Locator;
  /** The rendered MDX body — `PostTemplate` wraps it in the page's one
   *  `<article>`, so scoping through that role rules out any other prose
   *  block ever appearing on the page.
   *
   *  Skeletons are excluded, and that is not a refinement — it is the fix for a
   *  scenario that failed about one run in six. `app/blog/[slug]/loading.tsx`
   *  mirrors the real template deliberately: `Stack as="article"` around a
   *  `<Prose>`, which is an `<article>` containing a `.ds-prose` — the same two
   *  things this locator asks for. So the loading state SATISFIED it, and
   *  `expect(body).toBeVisible()` passed on a page that had not rendered a word
   *  yet. `codeBlocks` is scoped through here, `.count()` does not retry, and an
   *  article that does have code fences answered 0.
   *
   *  Filtering on the skeleton is what makes this locator mean what all three of
   *  its callers already assumed it meant: the body, once it is actually there.
   *  A locator that excludes the loading state retries past it on its own, so no
   *  caller needs a wait of its own. */
  readonly body: Locator;
  /** The article's highlighted code slabs. Selected on `data-language` rather
   *  than by role, for the reason `blog-index.ts` selects `<time>` by tag:
   *  `pre` maps to no ARIA role, so there is none to ask for. The attribute is
   *  `CodeBlock`'s own contract with the rehype pipeline, pinned by
   *  apps/blog/__tests__/content.test.ts, so it is a stabler handle than the
   *  class beside it. */
  readonly codeBlocks: Locator;

  constructor(private readonly page: Page) {
    this.mainHeading = page.getByRole('heading', { level: 1 });
    this.body = page
      .getByRole('article')
      .locator('.ds-prose')
      .filter({ hasNot: page.locator('.ds-skeleton') });
    this.codeBlocks = this.body.locator('pre[data-language]');
  }

  /** One address straight at the app, with no index click in between — the
   *  deliberate exception to the rule above, and the only way to ask what a
   *  miss ANSWERS with rather than what it draws. The navigation's response is
   *  returned instead of discarded, because a soft 404 renders the same body as
   *  a real one and they differ nowhere else. */
  async requestSlug(slug: string): Promise<Response | null> {
    return this.page.goto(`/blog/${slug}`);
  }
}
