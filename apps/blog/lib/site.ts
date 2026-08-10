/**
 * Single source for the deployed origin. `app/layout.tsx` needs it for
 * `metadataBase`, `app/rss.xml/route.ts` and `app/sitemap.ts` need it to build
 * absolute URLs — this is the one place the domain is written literally.
 *
 * The Vercel origin rather than a custom domain, because there is no registered
 * domain yet. That distinction is not cosmetic: a `metadataBase` pointing at a
 * host that does not resolve breaks every absolute URL built on it — the OG
 * image the card fetches, the `<link>` in every RSS item, every sitemap
 * `<loc>`. Aim it at somewhere real, always.
 *
 * `lib/og.tsx` also prints this host on every social card, which is the visible
 * argument for registering a domain. When one exists, this line is the only
 * edit — the feed tests derive their expectations from this constant.
 */
export const SITE_URL = new URL('https://acceptance-gate-blog.vercel.app');

export const SITE_TITLE = 'Carles Lima';

/** The half of the home page's `<title>` that is not the name, reused by the site OG card. */
export const SITE_TAGLINE = 'Frontend engineering and quality';

/** The rights holder the footer prints after the year. */
export const SITE_COPYRIGHT = 'Carles Lima · Barcelona';

/**
 * Pinned rather than read off the clock. `new Date().getFullYear()` makes the
 * rendered footer depend on when the build runs, which is drift a visual-diff
 * baseline cannot tell apart from a real regression.
 */
export const SITE_COPYRIGHT_YEAR = 2026;

export const SITE_DESCRIPTION =
  'Notes on Next.js, testing with Cypress and Gherkin, visual regression and coding agents.';

export function absoluteUrl(pathname: string): string {
  return new URL(pathname, SITE_URL).toString();
}
