import type { Locator, Page } from '@playwright/test';

/** The `SiteHeader` chrome every page renders — reached through this page
 *  object rather than `blog-index.ts` or `post.ts` since it is shared layout,
 *  not something either page owns. */
export class Chrome {
  /** `ThemeToggle`'s default accessible name — see
   *  `packages/ui/src/atoms/ThemeToggle/ThemeToggle.tsx`. */
  readonly themeToggle: Locator;

  constructor(private readonly page: Page) {
    this.themeToggle = page.getByRole('button', { name: 'Dark theme' });
  }

  /** Drives the real toggle, never `page.emulateMedia` or a direct attribute
   *  write — the scenario exists to exercise the shipping switch. Waits for
   *  `data-theme="dark"` to land on `<html>` before returning, so a scan
   *  started right after never races the click's own state update. */
  async switchToDarkTheme() {
    await this.themeToggle.click();
    await this.page.waitForFunction(
      () => document.documentElement.dataset.theme === 'dark',
    );
  }
}
