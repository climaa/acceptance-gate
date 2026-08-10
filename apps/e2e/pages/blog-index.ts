import type { Locator, Page } from '@playwright/test';

/** The only layer that may know about markup. Locators are role-based: a heading
 *  is a heading to a screen reader and to this file alike, and a class rename does
 *  not red the suite. */
export class BlogIndexPage {
  readonly mainHeading: Locator;

  constructor(private readonly page: Page) {
    this.mainHeading = page.getByRole('heading', { level: 1 });
  }

  async open() {
    await this.page.goto('/blog');
  }
}
