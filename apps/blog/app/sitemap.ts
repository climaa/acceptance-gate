import type { MetadataRoute } from 'next';
import { getAllPosts } from '@/lib/posts';
import { SITE_URL } from '@/lib/site';

function absoluteUrl(pathname: string): string {
  return new URL(pathname, SITE_URL).toString();
}

const STATIC_ROUTES = ['/', '/blog', '/about'];

export default function sitemap(): MetadataRoute.Sitemap {
  const staticEntries = STATIC_ROUTES.map((pathname) => ({
    url: absoluteUrl(pathname),
  }));

  const postEntries = getAllPosts().map((post) => ({
    url: absoluteUrl(`/blog/${post.slug}`),
    lastModified: post.date,
  }));

  return [...staticEntries, ...postEntries];
}
