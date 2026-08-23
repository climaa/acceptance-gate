import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';

/** The WCAG levels both lanes scan at. */
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** One violation, reduced to what a failure message can print. */
export interface A11yScan {
  violations: { id: string; nodes: number }[];
  /** `rule-id (3), other-rule (1)` — the whole scan on one line. */
  summary: string;
}

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

  /**
   * The axe scan both lanes assert on — the acceptance suite against seeded
   * worlds, the local lane against real data. One implementation because the
   * two must agree on what "no violations" means: same rule tags, same settled
   * DOM, and the same readable failure line (rule ids and node counts, never a
   * giant object diff).
   *
   * Returns rather than asserts: the claim belongs to a step, and `pages/` holds
   * no assertions about the requirement.
   */
  async axeViolations(): Promise<A11yScan> {
    // Settle the initial render so axe evaluates a stable DOM.
    await this.page.getByRole('heading').first().waitFor({ state: 'visible' });

    const results = await new AxeBuilder({ page: this.page })
      .withTags(AXE_TAGS)
      .analyze();
    const violations = results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.length,
    }));

    return {
      violations,
      summary: violations.map((v) => `${v.id} (${v.nodes})`).join(', '),
    };
  }
}
