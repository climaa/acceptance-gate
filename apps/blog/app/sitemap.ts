import type { MetadataRoute } from 'next';
import { getAllPosts, getAllTags, tagPath } from '@/lib/posts';
import { absoluteUrl } from '@/lib/site';

const STATIC_ROUTES = ['/', '/blog', '/about'];

export default function sitemap(): MetadataRoute.Sitemap {
  const staticEntries = STATIC_ROUTES.map((pathname) => ({
    url: absoluteUrl(pathname),
  }));

  const postEntries = getAllPosts().map((post) => ({
    url: absoluteUrl(`/blog/${post.slug}`),
    lastModified: post.date,
  }));

  // Slugs, not display text: they are the URLs `/tags/[tag]` prerenders, and the
  // percent-encoded form of the same tag is a second URL for one page.
  const tagEntries = getAllTags().map((tag) => ({
    url: absoluteUrl(tagPath(tag.slug)),
  }));

  return [...staticEntries, ...postEntries, ...tagEntries];
}
