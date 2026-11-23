import type { Locator, Page } from '@playwright/test';

/**
 * census's server, one constant like the blog's and the console's: the config
 * boots it on this port and the page object visits it, so the two cannot drift.
 * The next port after the console's two worlds (`visual-diff-hosts.ts`).
 *
 * `E2E_BASE_URL` never applies: that override aims the blog suite at a
 * deployment, and this server is the build `turbo run e2e` just made.
 */
export const CENSUS_HOST = 'http://localhost:3202';

/** The census home and the workspace pages it links to, located by role. */
export class CensusPage {
  readonly mainHeading: Locator;
  /** The home's open gaps, a region named by its heading ("Gaps 197"). */
  readonly gaps: Locator;

  constructor(private readonly page: Page) {
    this.mainHeading = page.getByRole('heading', { level: 1 });
    this.gaps = page.getByRole('region', { name: /^Gaps\b/ });
  }

  async openHome() {
    await this.page.goto(`${CENSUS_HOST}/`);
  }

  /**
   * One count of the testing pyramid, by the level its label names. The counts
   * are the flat figure's list, which is in the page whether or not the 3D scene
   * is drawn over the figure: the scene is decoration and hidden from roles.
   */
  pyramidCount(level: 'Code' | 'Visual' | 'Acceptance'): Locator {
    return this.page.getByRole('listitem').filter({ hasText: `${level} ·` });
  }

  /** The first workspace a gap names: on an unfiltered home, the region's first link. */
  firstGapWorkspace(): Locator {
    return this.gaps.getByRole('link').first();
  }
}
