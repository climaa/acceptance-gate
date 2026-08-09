// Imported explicitly rather than relying on `globals: true` — same reason as
// content.test.ts: tsconfig's `**/*.ts` include means tsc typechecks this file.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAllPosts } from '../lib/posts';
import { SITE_URL } from '../lib/site';

describe('app/rss.xml', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../lib/posts');
  });

  it('lists every published post and no drafts', async () => {
    const { GET } = await import('../app/rss.xml/route');
    const xml = await GET().text();
    const posts = getAllPosts();

    expect(posts.length).toBeGreaterThan(0);
    posts.forEach((post) => {
      expect(xml).toContain(`<title>${post.title}</title>`);
    });

    // content/posts ships posts with `draft: true` alongside published ones —
    // isPublished() must have filtered them before they reach the feed.
    const allSlugs = ['the-migration-that-passed-ci', 'gherkin-specs-that-survive'];
    allSlugs.forEach((slug) => {
      expect(posts.some((post) => post.slug === slug)).toBe(false);
      expect(xml).not.toContain(`/blog/${slug}`);
    });
  });

  it('builds absolute item URLs from the site origin', async () => {
    const { GET } = await import('../app/rss.xml/route');
    const xml = await GET().text();
    const posts = getAllPosts();

    posts.forEach((post) => {
      const url = new URL(`/blog/${post.slug}`, SITE_URL).toString();
      expect(xml).toContain(`<link>${url}</link>`);
      expect(xml).toContain(`<guid>${url}</guid>`);
    });
  });

  it('derives pubDate from frontmatter date, not the current time', async () => {
    const { GET } = await import('../app/rss.xml/route');
    const xml = await GET().text();
    const posts = getAllPosts();

    posts.forEach((post) => {
      const expected = new Date(`${post.date}T00:00:00Z`).toUTCString();
      expect(xml).toContain(`<pubDate>${expected}</pubDate>`);
    });
  });

  it('is a valid RSS document even with zero posts', async () => {
    vi.doMock('../lib/posts', () => ({ getAllPosts: () => [] }));
    const { GET } = await import('../app/rss.xml/route');
    const xml = await GET().text();

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain('</rss>');
    expect(xml).not.toContain('<item>');
  });

  it('serves application/rss+xml', async () => {
    const { GET } = await import('../app/rss.xml/route');
    const response = GET();
    expect(response.headers.get('Content-Type')).toContain('application/rss+xml');
  });
});

describe('app/sitemap', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../lib/posts');
  });

  it('includes one entry per post plus the static routes', async () => {
    const { default: sitemap } = await import('../app/sitemap');
    const posts = getAllPosts();
    const entries = sitemap();

    expect(entries).toHaveLength(posts.length + 3);
    ['/', '/blog', '/about'].forEach((pathname) => {
      expect(
        entries.some((entry) => entry.url === new URL(pathname, SITE_URL).toString()),
      ).toBe(true);
    });
    posts.forEach((post) => {
      const url = new URL(`/blog/${post.slug}`, SITE_URL).toString();
      expect(entries.some((entry) => entry.url === url)).toBe(true);
    });
  });

  it('is a valid, non-empty document even with zero posts', async () => {
    vi.doMock('../lib/posts', () => ({ getAllPosts: () => [] }));
    const { default: sitemap } = await import('../app/sitemap');
    const entries = sitemap();

    expect(entries).toHaveLength(3);
  });
});
