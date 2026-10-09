import type { MetadataRoute } from 'next';
import { blogPagePath, laterPages } from '@/lib/paging';
import { getAllPosts, getAllTags, tagPath } from '@/lib/posts';
import { absoluteUrl } from '@/lib/site';

const STATIC_ROUTES = ['/', '/blog', '/changelog', '/about'];

export default function sitemap(): MetadataRoute.Sitemap {
  const staticEntries = STATIC_ROUTES.map((pathname) => ({
    url: absoluteUrl(pathname),
  }));

  const posts = getAllPosts();

  const postEntries = posts.map((post) => ({
    url: absoluteUrl(`/blog/${post.slug}`),
    lastModified: post.date,
  }));

  // Pages 2 and up only: page 1 is `/blog`, already in STATIC_ROUTES, and
  // `/blog/page/1` redirects there rather than being a page of its own.
  const pageEntries = laterPages(posts.length).map((page) => ({
    url: absoluteUrl(blogPagePath(page)),
  }));

  // Slugs, not display text: they are the URLs `/tags/[tag]` prerenders, and the
  // percent-encoded form of the same tag is a second URL for one page.
  const tagEntries = getAllTags().map((tag) => ({
    url: absoluteUrl(tagPath(tag.slug)),
  }));

  return [...staticEntries, ...postEntries, ...pageEntries, ...tagEntries];
}
