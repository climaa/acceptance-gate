import type { Locator, Page, Response } from '@playwright/test';

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
  /** The `<nav aria-label="Pagination">` under the list. Rendered only when there
   *  is more than one page, so its presence is itself the claim "there is more". */
  readonly pagination: Locator;
  /** The one page number that is text rather than a link — `aria-current="page"`
   *  is what names it, to a screen reader and to this file alike. */
  readonly currentPage: Locator;

  constructor(private readonly page: Page) {
    this.mainHeading = page.getByRole('heading', { level: 1 });
    this.articleTitles = page.getByRole('heading', { level: 2 });
    this.articleDates = page.locator('time');
    this.articleReadingTimes = page.getByText(/^\d+ min$/);
    this.pagination = page.getByRole('navigation', { name: 'Pagination' });
    this.currentPage = this.pagination.locator('[aria-current="page"]');
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

  /** The control's own way to the next page — never a hand-built address. */
  async openNextPage() {
    const before = this.page.url();
    await this.pagination.getByRole('link', { name: 'Next page' }).click();
    // The link routes on the client, so the click returns while page 1 is still
    // on screen; a title read now is page 1's. The address changing is the
    // navigation having happened.
    await this.page.waitForURL((url) => url.href !== before);
  }

  /** The highest page the control names, read off the control rather than
   *  computed from a post count the suite must not know. */
  async lastPageNumber(): Promise<number> {
    const labels = await this.pagination
      .getByRole('link', { name: /^Page \d+$/ })
      .allInnerTexts();
    const current = await this.currentPage.allInnerTexts();
    const numbers = [...labels, ...current].map(Number).filter(Number.isFinite);
    if (numbers.length === 0) throw new Error('The pagination names no page numbers.');
    return Math.max(...numbers);
  }

  /** The response itself, for the scenario whose claim is the status line. */
  async requestPage(page: number): Promise<Response | null> {
    return this.page.goto(`/blog/page/${page}`);
  }
}
