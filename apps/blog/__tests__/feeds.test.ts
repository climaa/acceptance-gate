// Imported explicitly rather than relying on `globals: true` — same reason as
// content.test.ts: tsconfig's `**/*.ts` include means tsc typechecks this file.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAllPosts } from '../lib/posts';
import { SITE_URL } from '../lib/site';

// content/posts ships posts with `draft: true` alongside published ones —
// isPublished() must filter them out before they reach either feed.
const DRAFT_SLUGS = ['the-migration-that-passed-ci', 'gherkin-specs-that-survive'];

// Duplicated from app/sitemap.ts on purpose: an expectation that imports the
// value under test cannot catch that value being wrong.
const STATIC_ROUTES = ['/', '/blog', '/about'];

// Built with `new URL` rather than lib/site's absoluteUrl() for the same reason.
function postUrl(slug: string): string {
  return new URL(`/blog/${slug}`, SITE_URL).toString();
}

// The imports are dynamic because a test may mock `../lib/posts` first, and the
// modules under test read it at import time.
async function requestFeed(): Promise<Response> {
  const { GET } = await import('../app/rss.xml/route');
  return GET();
}

async function renderFeed(): Promise<string> {
  const response = await requestFeed();
  return response.text();
}

async function renderSitemap() {
  const { default: sitemap } = await import('../app/sitemap');
  return sitemap();
}

function mockEmptyPostList(): void {
  vi.doMock('../lib/posts', () => ({ getAllPosts: () => [] }));
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('../lib/posts');
});

describe('app/rss.xml', () => {
  it('lists every published post', async () => {
    const posts = getAllPosts();

    const xml = await renderFeed();

    expect(posts.length).toBeGreaterThan(0);
    posts.forEach((post) => {
      expect(xml).toContain(`<title>${post.title}</title>`);
    });
  });

  it('omits drafts', async () => {
    const publishedSlugs = getAllPosts().map((post) => post.slug);

    const xml = await renderFeed();

    DRAFT_SLUGS.forEach((slug) => {
      expect(publishedSlugs).not.toContain(slug);
      expect(xml).not.toContain(`/blog/${slug}`);
    });
  });

  it('builds absolute item URLs from the site origin', async () => {
    const posts = getAllPosts();

    const xml = await renderFeed();

    posts.forEach((post) => {
      expect(xml).toContain(`<link>${postUrl(post.slug)}</link>`);
      expect(xml).toContain(`<guid>${postUrl(post.slug)}</guid>`);
    });
  });

  it('derives pubDate from frontmatter date, not the current time', async () => {
    const posts = getAllPosts();

    const xml = await renderFeed();

    posts.forEach((post) => {
      const expected = new Date(`${post.date}T00:00:00Z`).toUTCString();
      expect(xml).toContain(`<pubDate>${expected}</pubDate>`);
    });
  });

  it('is a valid RSS document even with zero posts', async () => {
    mockEmptyPostList();

    const xml = await renderFeed();

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain('</rss>');
    expect(xml).not.toContain('<item>');
  });

  it('serves application/rss+xml', async () => {
    const response = await requestFeed();

    expect(response.headers.get('Content-Type')).toContain('application/rss+xml');
  });
});

describe('app/sitemap', () => {
  it('includes one entry per post plus the static routes', async () => {
    const posts = getAllPosts();

    const entries = await renderSitemap();

    const urls = entries.map((entry) => entry.url);
    expect(urls).toHaveLength(posts.length + STATIC_ROUTES.length);
    STATIC_ROUTES.forEach((pathname) => {
      expect(urls).toContain(new URL(pathname, SITE_URL).toString());
    });
    posts.forEach((post) => {
      expect(urls).toContain(postUrl(post.slug));
    });
  });

  it('is a valid, non-empty document even with zero posts', async () => {
    mockEmptyPostList();

    const entries = await renderSitemap();

    expect(entries).toHaveLength(STATIC_ROUTES.length);
  });
});
