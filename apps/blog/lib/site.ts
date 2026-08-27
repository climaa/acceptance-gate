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

export const SITE_TITLE = 'Carlos Lima';

/** The half of the home page's `<title>` that is not the name, reused by the site OG card. */
export const SITE_TAGLINE = 'Frontend engineering and quality';

/** The rights holder the footer prints after the year. */
export const SITE_COPYRIGHT = 'Carlos Lima · Barcelona';

/**
 * Pinned rather than read off the clock. `new Date().getFullYear()` makes the
 * rendered footer depend on when the build runs, which is drift a visual-diff
 * baseline cannot tell apart from a real regression.
 */
export const SITE_COPYRIGHT_YEAR = 2026;

/**
 * The 404 page's heading and its `<title>`, what it says under that, and the way
 * on. Nobody arrives here on purpose: a slug that changed, an address typed
 * wrong, or a draft's URL passed around before it was ever published. The copy
 * names the situation without accusing the reader of anything, because from out
 * here a post that was never published and one that never existed are the same
 * page. Neither is in `generateStaticParams`, so `proxy.ts` turns both into the
 * same `404` before either reaches a render — the copy is what makes that
 * indistinguishably deliberate rather than a leak.
 *
 * `/blog` rather than `/` as the way on: the header's wordmark is not a link,
 * and the index is what someone chasing an article actually wanted.
 */
export const NOT_FOUND_TITLE = 'Not found';

export const NOT_FOUND_NOTE =
  'Nothing at this address. An article that was never published and one that never existed read the same from out here.';

export const NOT_FOUND_ACTION = 'All articles';

/**
 * What `app/error.tsx` and `app/global-error.tsx` say when a render throws.
 *
 * Separate copy from the 404's, because the two are not the same event and a
 * reader can act on the difference: a miss means the address leads nowhere and
 * the way on is elsewhere on the site, while this means the address was right
 * and this end failed to serve it. So the way on here is the same page again,
 * not a different one — `retry()` re-renders the segment, and for a transient
 * fault that is the whole fix.
 *
 * The copy names no cause. What threw is a server-side detail the reader cannot
 * act on, and in production React redacts the message anyway.
 */
export const ERROR_TITLE = 'Something went wrong';

export const ERROR_NOTE =
  'This page could not be rendered. Nothing is wrong with the address you followed — the fault is on this end.';

export const ERROR_ACTION = 'Try again';

export const SITE_DESCRIPTION =
  'Notes on Next.js, testing with Cypress and Gherkin, visual regression and coding agents.';

export function absoluteUrl(pathname: string): string {
  return new URL(pathname, SITE_URL).toString();
}
