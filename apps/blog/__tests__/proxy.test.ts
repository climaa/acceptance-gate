import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from 'gray-matter';
import { NextRequest } from 'next/server';
// Imported explicitly rather than relying on `globals: true` — same reason as
// content.test.ts: tsconfig's `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import { proxy } from '../proxy';
import { tagSlug } from '../lib/posts';

/**
 * Which addresses reach a route and which are refused before one renders.
 *
 * The status code itself belongs to the two 404 scenarios in
 * apps/e2e/features/acceptance/blog.feature: only something that speaks HTTP end
 * to end can say the response line was a `404` rather than a `200` with a
 * not-found body streamed inside it, which is the whole defect. What lives here
 * is everything below that — which addresses the check calls known, and the
 * inputs that would make it throw or refuse a page that already worked.
 *
 * The expected sets are read off content/posts directly rather than through the
 * accessors the proxy uses, for the reason tags.test.ts gives: `getAllPosts()`
 * deciding a post exists is exactly the claim a test has to be able to
 * contradict.
 */

const POSTS_DIR = path.resolve(__dirname, '..', 'content', 'posts');

const rawPosts = fs
  .readdirSync(POSTS_DIR)
  .filter((file) => /\.mdx?$/.test(file))
  .map((file) => {
    const { data } = matter(fs.readFileSync(path.join(POSTS_DIR, file), 'utf8'));
    return {
      slug: file.replace(/\.mdx?$/, ''),
      tags: (data.tags ?? []) as string[],
      draft: data.draft === true,
    };
  });

const published = rawPosts.filter((post) => !post.draft);
const drafts = rawPosts.filter((post) => post.draft);
const publishedTagSlugs = [
  ...new Set(published.flatMap((post) => post.tags).map(tagSlug)),
];

/** The response line, or `null` when the proxy let the request through. */
function statusOf(pathname: string): number | null {
  const response = proxy(new NextRequest(new URL(pathname, 'http://localhost:3100')));

  // `NextResponse.next()` is a 200 carrying the continue header; only a rewrite
  // sets a status of its own, so the header is what separates "passed through"
  // from "refused".
  return response.headers.get('x-middleware-next') ? null : response.status;
}

describe('proxy', () => {
  it('lets every published post through', () => {
    const refused = published.filter((post) => statusOf(`/blog/${post.slug}`) !== null);

    expect(refused.map((post) => post.slug)).toEqual([]);
  });

  it('refuses a draft at its own address', () => {
    // The fixture guarantees there is one; a suite that silently tested nothing
    // here is the failure mode e2e-draft-fixture.test.ts exists to prevent.
    expect(drafts.length).toBeGreaterThan(0);

    const allowed = drafts.filter((post) => statusOf(`/blog/${post.slug}`) === null);

    expect(allowed.map((post) => post.slug)).toEqual([]);
  });

  it('refuses a slug that never existed', () => {
    const status = statusOf('/blog/esto-no-existe-jamas-12345');

    expect(status).toBe(404);
  });

  it('lets every tag a published post carries through', () => {
    const refused = publishedTagSlugs.filter(
      (slug) => statusOf(`/tags/${slug}`) !== null,
    );

    expect(refused).toEqual([]);
  });

  it('refuses a tag no published post carries', () => {
    const status = statusOf('/tags/no-such-tag');

    expect(status).toBe(404);
  });

  // The regression this check could most easily cause. `/tags/CI` and
  // `/tags/visual%20regression` are pages today — the route matches on the slug
  // rather than on the frontmatter's writing — so a proxy comparing the raw
  // param against a set of slugs would 404 addresses that have always worked.
  it('lets a tag through in any casing, as the page does', () => {
    const shouted = publishedTagSlugs.map((slug) => slug.toUpperCase());

    const refused = shouted.filter((slug) => statusOf(`/tags/${slug}`) !== null);

    expect(refused).toEqual([]);
  });

  it('lets a multi-word tag through under its percent-encoded display text', () => {
    const spaced = published.flatMap((post) => post.tags).filter((tag) => /\s/.test(tag));
    // Asserted rather than assumed: with no multi-word tag on any published post
    // the filter below is empty and this case would pass having tried nothing.
    expect(spaced.length).toBeGreaterThan(0);

    const refused = spaced.filter(
      (tag) => statusOf(`/tags/${encodeURIComponent(tag)}`) !== null,
    );

    expect(refused).toEqual([]);
  });

  // The error path. `decodeURIComponent('%')` throws, and an uncaught throw here
  // is a 500 in front of every article rather than a 404 on one address.
  it('refuses a malformed address instead of throwing', () => {
    const status = statusOf('/blog/%');

    expect(status).toBe(404);
  });
});
