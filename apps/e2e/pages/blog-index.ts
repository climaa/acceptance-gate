import type { Locator, Page } from '@playwright/test';

/** The only layer that may know about markup. Locators are role-based: a heading
 *  is a heading to a screen reader and to this file alike, and a class rename does
 *  not red the suite. */
export class BlogIndexPage {
  readonly mainHeading: Locator;
  /** One `<h2>` per listed post — the index renders no list/listitem role, so a
   *  post's own heading is what stands in for "an article" here. */
  readonly articleTitles: Locator;
  /** One `<time>` per `PostMeta`, across every listed post. */
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
    await this.articleTitles.first().getByRole('link').click();
  }

  /** Listed article titles matching `title`, empty when none does. */
  titled(title: string): Locator {
    return this.articleTitles.filter({ hasText: title });
  }
}
