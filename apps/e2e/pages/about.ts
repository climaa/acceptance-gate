import type { Locator, Page } from '@playwright/test';

/** The portfolio /about points at. One constant rather than a literal in each
 *  step, so the scenario that reads the link and the one that dials the address
 *  can never drift into checking two different sites. */
export const PORTFOLIO_URL = 'https://carloslima.dev';

/** The authorship page. Located by href rather than by link text: the claim is
 *  that this page points a reader at the portfolio, and the wording around the
 *  link is prose the author may rewrite without the requirement changing. */
export class AboutPage {
  readonly mainHeading: Locator;
  readonly portfolioLinks: Locator;

  constructor(private readonly page: Page) {
    this.mainHeading = page.getByRole('heading', { level: 1 });
    this.portfolioLinks = page.getByRole('link', { name: /carloslima\.dev/ });
  }

  async open() {
    await this.page.goto('/about');
  }

  /** What the portfolio address actually answers, followed to its end.
   *
   *  `https://carloslima.dev` does not answer 200 itself — it is a 307 to
   *  `/en`, measured — so a request that refused redirects would fail on a site
   *  that is perfectly healthy. Playwright follows by default; this says so out
   *  loud, because "the URL returns 200" reads like a claim about the first hop
   *  and is not one.
   *
   *  This is the only request the acceptance suite makes to a host it does not
   *  start itself. See the scenario for why that is a deliberate exception. */
  async dialPortfolio() {
    return this.page.request.get(PORTFOLIO_URL);
  }
}
