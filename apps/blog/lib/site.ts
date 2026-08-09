/**
 * Single source for the deployed origin. `app/layout.tsx` needs it for
 * `metadataBase`, `app/rss.xml/route.ts` and `app/sitemap.ts` need it to build
 * absolute URLs — this is the one place the domain is written literally.
 */
export const SITE_URL = new URL('https://carleslima.dev');

export const SITE_TITLE = 'Carles Lima';

/** The half of the home page's `<title>` that is not the name, reused by the site OG card. */
export const SITE_TAGLINE = 'Frontend engineering and quality';

export const SITE_DESCRIPTION =
  'Notes on Next.js, testing with Cypress and Gherkin, visual regression and coding agents.';

export function absoluteUrl(pathname: string): string {
  return new URL(pathname, SITE_URL).toString();
}
