import type { MetadataRoute } from 'next';

import { absoluteUrl } from '@/lib/site.ts';

/**
 * What `app/sitemap.ts` is for: a sitemap nothing points at is found only by
 * convention. Everything is allowed — every address is a page meant to be read.
 * Absolute, because the sitemap directive takes a full URL rather than a path.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
