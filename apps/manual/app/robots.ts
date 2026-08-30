import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/site';

/**
 * What `app/sitemap.ts` is for. A sitemap nothing points at is discoverable only
 * by the `/sitemap.xml` convention or a console submission, and this is the file
 * that names it.
 *
 * Everything is allowed. There are four addresses and all of them are the point
 * — this manual exists to be read by people arriving from the console and from
 * the repository.
 *
 * Absolute, because the sitemap directive has to be: it is the one line in
 * robots.txt that takes a full URL rather than a path.
 *
 * `apps/blog` serves a sitemap and no robots.txt, so it has this same gap.
 * Closing it there is its own change rather than something to widen this one
 * with — noted rather than done here.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
