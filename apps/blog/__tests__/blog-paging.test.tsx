import { isValidElement, type ReactElement } from 'react';
// Imported explicitly rather than relying on `globals: true` — same reason as
// content.test.ts: tsconfig's `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import type { BlogIndexTemplateProps, PaginationProps } from '@gate/ui';
import BlogIndexPage from '../app/blog/page';
import BlogPagePage, {
  generateMetadata,
  generateStaticParams,
} from '../app/blog/page/[n]/page';
import { getAllPosts } from '../lib/posts';

/**
 * The index, page by page: which posts each address lists, which addresses are
 * prerendered, and what the control under the list is told. The status line of
 * a miss is proxy.test.ts's; what renders under it is here.
 *
 * Both pages are read as the props they hand `BlogIndexTemplate`, the way
 * tags.test.ts reads its own page.
 */

const PUBLISHED = getAllPosts();

// Duplicated from lib/paging.ts on purpose: an expectation that imports the
// value under test cannot catch that value being wrong.
const POSTS_PER_PAGE = 4;
const LAST_PAGE = Math.ceil(PUBLISHED.length / POSTS_PER_PAGE);

/**
 * `searchParams` beside `params` because `PageProps` is the whole contract Next
 * hands a page, not the half this one reads.
 */
const propsFor = (n: string) => ({
  params: Promise.resolve({ n }),
  searchParams: Promise.resolve({}),
});

const renderLaterPage = async (n: string): Promise<BlogIndexTemplateProps> =>
  (await BlogPagePage(propsFor(n))).props;

/** The control the page put under its list, read back through its own props. */
const paginationOf = (props: BlogIndexTemplateProps): PaginationProps => {
  const control = props.pagination;
  if (!isValidElement<PaginationProps>(control))
    throw new Error('no control under the list');
  return (control as ReactElement<PaginationProps>).props;
};

const hrefsOf = (props: BlogIndexTemplateProps) => props.posts.map((post) => post.href);

describe('content/posts', () => {
  // The cases below need a second page to exist; with four or fewer published
  // posts they would pass having tried nothing.
  it('carries more than one page of published posts', () => {
    expect(LAST_PAGE).toBeGreaterThan(1);
  });
});

describe('/blog/page/[n]', () => {
  it('prerenders every page after the first, and only those', () => {
    const expected = Array.from({ length: LAST_PAGE - 1 }, (_, i) => ({
      n: String(i + 2),
    }));

    expect(generateStaticParams()).toEqual(expected);
  });

  it('lists the posts that follow page 1, in order, without overlap', async () => {
    const pageOne = hrefsOf(BlogIndexPage().props);
    const pageTwo = hrefsOf(await renderLaterPage('2'));

    expect(pageTwo).toEqual(
      PUBLISHED.slice(POSTS_PER_PAGE, POSTS_PER_PAGE * 2).map(
        (post) => `/blog/${post.slug}`,
      ),
    );
    expect(pageTwo.some((href) => pageOne.includes(href))).toBe(false);
  });

  it('runs short on the last page rather than wrapping', async () => {
    const last = await renderLaterPage(String(LAST_PAGE));

    expect(last.posts.length).toBe(PUBLISHED.length - POSTS_PER_PAGE * (LAST_PAGE - 1));
  });

  it('tells the control which page it is on and how many there are', async () => {
    const control = paginationOf(await renderLaterPage('2'));

    expect(control.page).toBe(2);
    expect(control.pageCount).toBe(LAST_PAGE);
    // The app owns its routes: page 1 is /blog, not /blog/page/1.
    expect(control.hrefFor?.(1)).toBe('/blog');
    expect(control.hrefFor?.(2)).toBe('/blog/page/2');
  });

  it('says where the reader is, under the same heading as page 1', async () => {
    const props = await renderLaterPage('2');

    expect(props.title).toBe('Blog');
    expect(props.intro).toBe(`Page 2 of ${LAST_PAGE}`);
  });

  it('names the page in its title and canonical address', async () => {
    const metadata = await generateMetadata(propsFor('2'));

    expect(metadata.title).toBe('Blog, page 2');
    expect(metadata.alternates?.canonical).toBe('/blog/page/2');
  });

  // 404, not an empty index: a page for anything a reader types is an unbounded
  // set of thin pages, and the sitemap only ever wrote these spellings.
  it('404s past the last page', async () => {
    await expect(renderLaterPage(String(LAST_PAGE + 1))).rejects.toThrow();
  });

  it('404s on page 1 and on spellings the sitemap never wrote', async () => {
    for (const n of ['1', '0', '02', 'two']) {
      await expect(renderLaterPage(n)).rejects.toThrow();
    }
  });

  it('carries no metadata for a page that does not exist', async () => {
    expect(await generateMetadata(propsFor(String(LAST_PAGE + 1)))).toEqual({});
  });
});

describe('/blog', () => {
  it('is page 1 of the same count, and its control knows it', () => {
    const control = paginationOf(BlogIndexPage().props);

    expect(control.page).toBe(1);
    expect(control.pageCount).toBe(LAST_PAGE);
  });
});
