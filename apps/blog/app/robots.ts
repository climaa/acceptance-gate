import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/site';

/**
 * What `app/sitemap.ts` is for. A sitemap nothing points at is discoverable only
 * by the `/sitemap.xml` convention or a console submission, and this is the file
 * that names it.
 *
 * Everything is allowed. Draft posts are already excluded from the sitemap and
 * the RSS feed by `isPublished()` in `lib/posts.ts`, and `proxy.ts` turns an
 * unpublished slug into a real 404 — a `disallow` for drafts here would publish
 * the slug it is trying to hide, in a file crawlers fetch first.
 *
 * Absolute, because the sitemap directive has to be: it is the one line in
 * robots.txt that takes a full URL rather than a path.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
