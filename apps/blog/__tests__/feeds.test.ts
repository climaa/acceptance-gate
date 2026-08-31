// Imported explicitly rather than relying on `globals: true` — same reason as
// content.test.ts: tsconfig's `**/*.ts` include means tsc typechecks this file.
import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from 'gray-matter';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAllPosts, getAllTags } from '../lib/posts';
import { SITE_URL } from '../lib/site';

// content/posts ships posts with `draft: true` alongside published ones —
// isPublished() must filter them out before they reach either feed.
//
// Read from disk rather than hardcoded: a literal list has to be edited every
// time a post is published, so the first symptom of forgetting is this suite
// failing on a content change that is entirely correct. Reading the frontmatter
// directly is still independent of the code under test — `getAllPosts()` is the
// function that hides drafts, so an expectation built from it could never catch
// it failing to. Same reasoning as content.test.ts reading the directory itself.
const POSTS_DIR = path.resolve(__dirname, '..', 'content', 'posts');

const DRAFT_SLUGS = fs
  .readdirSync(POSTS_DIR)
  .filter((file) => /\.mdx?$/.test(file))
  .filter(
    (file) =>
      matter(fs.readFileSync(path.join(POSTS_DIR, file), 'utf8')).data.draft === true,
  )
  .map((file) => file.replace(/\.mdx?$/, ''));

// Duplicated from app/sitemap.ts on purpose: an expectation that imports the
// value under test cannot catch that value being wrong.
const STATIC_ROUTES = ['/', '/blog', '/about'];

// Built with `new URL` rather than lib/site's absoluteUrl() for the same reason.
function postUrl(slug: string): string {
  return new URL(`/blog/${slug}`, SITE_URL).toString();
}

function tagUrl(slug: string): string {
  return new URL(`/tags/${slug}`, SITE_URL).toString();
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
  vi.doMock('../lib/posts', () => ({ getAllPosts: () => [], getAllTags: () => [] }));
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

    // With no drafts on disk the loop below asserts nothing and passes forever —
    // the failure mode this suite exists to prevent.
    expect(DRAFT_SLUGS.length).toBeGreaterThan(0);
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
  it('includes one entry per post and per tag, plus the static routes', async () => {
    const posts = getAllPosts();
    const tags = getAllTags();

    const entries = await renderSitemap();

    const urls = entries.map((entry) => entry.url);
    expect(urls).toHaveLength(posts.length + tags.length + STATIC_ROUTES.length);
    STATIC_ROUTES.forEach((pathname) => {
      expect(urls).toContain(new URL(pathname, SITE_URL).toString());
    });
    posts.forEach((post) => {
      expect(urls).toContain(postUrl(post.slug));
    });
    tags.forEach((tag) => {
      expect(urls).toContain(tagUrl(tag.slug));
    });
  });

  // Every tag URL the sitemap advertises is prerendered by the tag route, which
  // is only true while both read the same deduplicated set.
  it('advertises the slug form of a tag, never the display text', async () => {
    const entries = await renderSitemap();

    const tagUrls = entries
      .map((entry) => entry.url)
      .filter((url) => url.includes('/tags/'));
    expect(tagUrls.length).toBeGreaterThan(0);
    tagUrls.forEach((url) => {
      expect(url).toMatch(/\/tags\/[a-z0-9-]+$/);
    });
  });

  it('is a valid, non-empty document even with zero posts', async () => {
    mockEmptyPostList();

    const entries = await renderSitemap();

    expect(entries).toHaveLength(STATIC_ROUTES.length);
  });
});

describe('app/robots', () => {
  async function renderRobots() {
    const { default: robots } = await import('../app/robots');
    return robots();
  }

  it('advertises the sitemap as an absolute URL at the site origin', async () => {
    const { sitemap } = await renderRobots();

    expect(sitemap).toBe(new URL('/sitemap.xml', SITE_URL).toString());
  });

  it('allows everything, so a future disallow cannot land silently', async () => {
    const { rules } = await renderRobots();

    expect(rules).toEqual({ userAgent: '*', allow: '/' });
  });
});
