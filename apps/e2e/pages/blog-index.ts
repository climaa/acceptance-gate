import type { Locator, Page } from '@playwright/test';

/** The only layer that may know about markup. Locators are role-based: a heading
 *  is a heading to a screen reader and to this file alike, and a class rename does
 *  not red the suite. */
export class BlogIndexPage {
  readonly mainHeading: Locator;
  /** One `<h2>` per listed post — the post list carries no list/listitem role, so
   *  a post's own heading is what stands in for "an article" here. */
  readonly articleTitles: Locator;
  /** One `<time>` per `PostMeta`, across every listed post. Selected by tag rather
   *  than by role — `<time>` maps to no ARIA role, so there is none to ask for. */
  readonly articleDates: Locator;
  /** `PostMeta`'s reading-time text ("4 min") as a pattern, never an exact
   *  string — the post catalogue changes, the shape of the text does not. */
  readonly articleReadingTimes: Locator;

  constructor(private readonly page: Page) {
    this.mainHeading = page.getByRole('heading', { level: 1 });
    this.articleTitles = page.getByRole('heading', { level: 2 });
    this.articleDates = page.locator('time');
    this.articleReadingTimes = page.getByText(/^\d+ min$/);
  }

  async open() {
    await this.page.goto('/blog');
  }

  /** The link inside the first listed post's title — the only way in to the
   *  full article, per the requirement that a step never knows a slug. */
  async openFirstArticle() {
    await this.openArticleAt(0);
  }

  /** The same way in, for a step that has to walk the list rather than take the
   *  top of it — searching the index for an article with some property cannot
   *  be done from the index, because the index does not render post bodies. The
   *  position is still the only identifier used: no slug, no title. */
  async openArticleAt(index: number) {
    await this.articleTitles.nth(index).getByRole('link').click();
  }

  /** `/tags/[tag]` is reached only by clicking a rendered chip — a step must
   *  never hardcode a slug that rots when the content changes. `TagList`'s chips
   *  are the only `listitem`s the index renders, so the first one is
   *  unambiguously the first tag of the first listed post. */
  async openFirstTag() {
    await this.page.getByRole('listitem').first().getByRole('link').click();
  }

  articlesTitled(title: string): Locator {
    return this.articleTitles.filter({ hasText: title });
  }
}
