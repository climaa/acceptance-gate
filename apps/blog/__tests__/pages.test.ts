import NextLink from 'next/link';
import { createElement, isValidElement, type ReactNode } from 'react';
// Imported explicitly rather than relying on `globals: true` — same reason as
// content.test.ts: tsconfig's `**/*.ts` include means tsc typechecks this file.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BlogIndexTemplateProps, PostTemplateProps } from '@gate/ui';
import BlogIndexPage from '../app/blog/page';
import PostPage from '../app/blog/[slug]/page';
import HomePage from '../app/page';
import { getAllPosts, tagPath } from '../lib/posts';

/**
 * What the three post-bearing routes render now that the design system draws
 * them: heading order, where each link points, and the nested-anchor bug the
 * hand-rolled cards carried.
 *
 * `/blog` and `/` are synchronous and render here in full; the post page is an
 * async Server Component holding `MDXRemote`, so it is read as the props it
 * hands `PostTemplate` — the same way tags.test.ts reads its own page.
 */

const PUBLISHED = getAllPosts();

/** The slice the home page lists — it shows the newest four, `/blog` shows all. */
const ON_HOME = PUBLISHED.slice(0, 4);

/**
 * The article the post-page cases render. Optional only because
 * `noUncheckedIndexedAccess` says so — the fixture guard below fails first if
 * content stops carrying a published post.
 */
const [ARTICLE] = PUBLISHED;
const ARTICLE_SLUG = ARTICLE?.slug ?? '';

/** A tag whose display text and slug differ, which is where a wrong href shows. */
const MULTI_WORD_TAG = 'visual regression';

const headingLevels = (html: string) =>
  [...html.matchAll(/<h([1-6])\b/g)].map(([, level]) => Number(level));

/** An anchor opened before the previous one closed — invalid, and unreachable. */
const hasNestedAnchor = (html: string) =>
  /<a\b[^>]*>(?:(?!<\/a>)[\s\S])*?<a\b/.test(html);

const hrefsIn = (html: string) =>
  [...html.matchAll(/href="([^"]*)"/g)].map(([, href]) => href);

const renderPage = (Page: () => ReactNode) => renderToStaticMarkup(createElement(Page));

/**
 * `searchParams` beside `params` because `PageProps<'/blog/[slug]'>` is the whole
 * contract Next hands a page, not the half this one reads. The page itself never
 * touches it: under `cacheComponents` reading it would open a dynamic hole in a
 * route built to prerender.
 */
const postPage = async (slug: string): Promise<PostTemplateProps> =>
  (
    await PostPage({
      params: Promise.resolve({ slug }),
      searchParams: Promise.resolve({}),
    })
  ).props;

const blogIndex = (): BlogIndexTemplateProps => BlogIndexPage().props;

describe('content/posts', () => {
  // A suite whose fixtures no longer exist would pass while protecting nothing —
  // the same guard content.test.ts carries.
  it('finds the published posts it was written against', () => {
    expect(PUBLISHED.length).toBeGreaterThan(0);
    expect(PUBLISHED.flatMap((post) => post.tags)).toContain(MULTI_WORD_TAG);
  });
});

describe('the home page', () => {
  // The cards sit under an existing <h2>, so they are h3 — the level the blog
  // index does not use. Wave 3 asserts heading order; this is where it is set.
  it('nests the post cards one level below the section heading', () => {
    const html = renderPage(HomePage);

    expect(headingLevels(html)).toEqual([1, 2, ...ON_HOME.map(() => 3)]);
  });

  it('links each card at the post it lists', () => {
    const html = renderPage(HomePage);

    expect(hrefsIn(html)).toEqual(
      expect.arrayContaining(ON_HOME.map((post) => `/blog/${post.slug}`)),
    );
  });

  // The bug PostCard exists to remove: wrapping the card body in one <a> puts
  // the tag links inside it, and a nested anchor is unreachable.
  it('nests no anchor inside another', () => {
    const html = renderPage(HomePage);

    expect(hasNestedAnchor(html)).toBe(false);
  });

  // The chips must land on the pages /tags/[tag] prerenders. TagList's own
  // default would encode the display text, which is a second URL for one page.
  it('points every tag chip at the prerendered tag route', () => {
    const html = renderPage(HomePage);

    expect(hrefsIn(html)).toContain(tagPath(MULTI_WORD_TAG));
    expect(hrefsIn(html)).not.toContain(`/tags/${encodeURIComponent(MULTI_WORD_TAG)}`);
  });
});

describe('the blog index', () => {
  it('lists every published post, newest first', () => {
    const props = blogIndex();

    expect(props.posts.map((post) => post.href)).toEqual(
      PUBLISHED.map((post) => `/blog/${post.slug}`),
    );
  });

  it('renders the page title as the only h1, with each card an h2 below it', () => {
    const html = renderPage(BlogIndexPage);

    expect(headingLevels(html)).toEqual([1, ...PUBLISHED.map(() => 2)]);
  });

  it('names the app’s router link once per card', () => {
    const props = blogIndex();

    expect(props.posts.every((post) => post.as === NextLink)).toBe(true);
  });

  it('points every tag chip at the prerendered tag route', () => {
    const html = renderPage(BlogIndexPage);

    expect(hrefsIn(html)).toContain(tagPath(MULTI_WORD_TAG));
    expect(hrefsIn(html)).not.toContain(`/tags/${encodeURIComponent(MULTI_WORD_TAG)}`);
  });

  it('nests no anchor inside another', () => {
    const html = renderPage(BlogIndexPage);

    expect(hasNestedAnchor(html)).toBe(false);
  });

  // Unreachable from content that has posts, and the slot the template exists to
  // have filled: an index that lists nothing must still say why.
  it('carries wording for the empty case', () => {
    const props = blogIndex();

    expect(props.empty).toBeTruthy();
  });
});

describe('the post page', () => {
  it('hands the article’s own frontmatter to the template', async () => {
    const props = await postPage(ARTICLE_SLUG);

    expect(props.title).toBe(ARTICLE?.title);
    expect(props.date).toBe(ARTICLE?.date);
    expect(props.readingMinutes).toBe(ARTICLE?.readingMinutes);
    expect(props.tags).toEqual(ARTICLE?.tags);
  });

  it('points every tag chip at the prerendered tag route', async () => {
    const props = await postPage(ARTICLE_SLUG);

    expect(props.tagHref?.(MULTI_WORD_TAG)).toBe(tagPath(MULTI_WORD_TAG));
  });

  it('names the app’s router link once for the whole article', async () => {
    const props = await postPage(ARTICLE_SLUG);

    expect(props.as).toBe(NextLink);
  });

  // The body stays the app's: the template takes rendered children, so MDXRemote
  // and the rehype pipeline never reach packages/ui.
  it('renders the body itself rather than handing over a source string', async () => {
    const props = await postPage(ARTICLE_SLUG);

    expect(isValidElement(props.children)).toBe(true);
  });

  it('404s on a slug no post carries', async () => {
    await expect(postPage('no-such-post')).rejects.toThrow();
  });
});
