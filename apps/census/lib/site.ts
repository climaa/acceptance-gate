import type { Metadata } from 'next';

/**
 * Single source for the deployed origin: `app/layout.tsx` hands it to Next as
 * `metadataBase`, and every absolute URL in the metadata resolves against it.
 * This is the one place the host is written literally.
 *
 * Aim it at somewhere real, always: a `metadataBase` pointing at a host that
 * does not resolve breaks every absolute URL built on it. Vercel assigns a
 * project's `.vercel.app` name once, at creation — the project was created as
 * `census`, `census.vercel.app` was already someone else's, so it was minted
 * `census-jet.vercel.app`, which now 307s to the custom domain below.
 */
export const SITE_URL = new URL('https://census.carloslima.dev');

export const SITE_TITLE = 'Census';

export const SITE_DESCRIPTION =
  "What this repository's tests, stories, scenarios and code health cover, and every gap left to file.";

/**
 * The Open Graph fields every page shares. Next merges metadata shallowly: a
 * page that sets `openGraph` replaces the layout's whole object, and would drop
 * `og:site_name`, `og:locale` and `og:type` with it. So the layout and
 * `lib/share.ts` spread this one object, and nothing spells the fields twice.
 */
export const SITE_OPEN_GRAPH = {
  type: 'website',
  locale: 'en_US',
  siteName: SITE_TITLE,
} satisfies Metadata['openGraph'];
