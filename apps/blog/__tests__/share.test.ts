import type { Metadata } from 'next';
// Imported explicitly rather than relying on `globals: true` — same reason as
// content.test.ts: tsconfig's `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import { metadata as aboutMetadata } from '../app/about/page';
import { generateMetadata as postMetadata } from '../app/blog/[slug]/page';
import { metadata as blogMetadata } from '../app/blog/page';
import { generateMetadata as laterPageMetadata } from '../app/blog/page/[n]/page';
import { metadata as changelogMetadata } from '../app/changelog/page';
import { metadata as homeMetadata } from '../app/page';
import sitemap from '../app/sitemap';
import { generateMetadata as tagMetadata } from '../app/tags/[tag]/page';
import { getAllPosts } from '../lib/posts';
import {
  indexDescription,
  pageMetadata,
  postShareImage,
  SITE_SHARE_IMAGE,
  tagDescription,
} from '../lib/share';
import { SITE_ALTERNATES, SITE_OPEN_GRAPH, SITE_URL } from '../lib/site';

/**
 * What a pasted link previews as: the tags a crawler reads off `<head>`, as the
 * metadata the pages hand Next. Whether those tags land inside `<head>` for
 * each crawler is the deployed site's to show, and is checked there.
 */

// Duplicated from lib/og.tsx on purpose, as og.test.ts does: an expectation that
// imports the value under test cannot catch that value being wrong.
const CARD = { width: 1200, height: 630, type: 'image/png' };

const [ARTICLE] = getAllPosts();

function article() {
  if (!ARTICLE) throw new Error('content/posts publishes no post to share');
  return ARTICLE;
}

const PAGE = { path: '/somewhere', title: 'Somewhere', description: 'A page.' };

type OpenGraphWithType = NonNullable<Metadata['openGraph']> & { type?: string };

function openGraphOf(metadata: Metadata): OpenGraphWithType {
  return metadata.openGraph as OpenGraphWithType;
}

describe('pageMetadata', () => {
  // A page with no og:url previewed as the bare host on Upwork.
  it('names the page as both its canonical and its og:url', () => {
    const metadata = pageMetadata(PAGE);

    expect(metadata.alternates?.canonical).toBe(PAGE.path);
    expect(metadata.openGraph?.url).toBe(PAGE.path);
  });

  // Next merges metadata shallowly: an `openGraph` without these loses them.
  it('keeps the site-wide Open Graph fields and the RSS alternate', () => {
    const metadata = pageMetadata(PAGE);

    expect(metadata.openGraph).toMatchObject(SITE_OPEN_GRAPH);
    expect(metadata.alternates).toMatchObject(SITE_ALTERNATES);
  });

  it('heads the preview with the title the tab shows', () => {
    const metadata = pageMetadata(PAGE);

    expect(metadata.openGraph?.title).toBe('Somewhere · Carlos Lima');
  });

  it('heads the preview with an absolute title as written', () => {
    const metadata = pageMetadata({ ...PAGE, title: { absolute: 'Whole title' } });

    expect(metadata.openGraph?.title).toBe('Whole title');
  });

  it('heads the preview with its own share title when given one', () => {
    const metadata = pageMetadata({ ...PAGE, shareTitle: 'Shared as' });

    expect(metadata.openGraph?.title).toBe('Shared as');
    expect(metadata.title).toBe(PAGE.title);
  });

  it('shares the site card, at its canvas size, when the page has none', () => {
    const metadata = pageMetadata(PAGE);

    expect(metadata.openGraph?.images).toEqual([{ ...SITE_SHARE_IMAGE, ...CARD }]);
  });

  it('says the same thing to X as to everyone else', () => {
    const metadata = pageMetadata(PAGE);

    expect(metadata.twitter).toEqual({
      card: 'summary_large_image',
      title: metadata.openGraph?.title,
      description: PAGE.description,
      images: metadata.openGraph?.images,
    });
  });

  it('is a website, with no article fields, unless it is a post', () => {
    const metadata = pageMetadata(PAGE);

    expect(openGraphOf(metadata)).toMatchObject({ type: 'website' });
    expect(metadata.openGraph).not.toHaveProperty('publishedTime');
  });

  it('is an article, dated and tagged, when it is a post', () => {
    const post = { date: '2026-01-02', updated: '2026-02-03', tags: ['ci'] };

    const metadata = pageMetadata({ ...PAGE, article: post });

    expect(openGraphOf(metadata)).toMatchObject({
      type: 'article',
      publishedTime: post.date,
      modifiedTime: post.updated,
      tags: post.tags,
    });
  });

  // An article:modified_time equal to the publish time says nothing.
  it('names no modified time for a post never revised', () => {
    const metadata = pageMetadata({ ...PAGE, article: { date: '2026-01-02', tags: [] } });

    expect(metadata.openGraph).not.toHaveProperty('modifiedTime');
  });
});

describe('postShareImage', () => {
  it('is the post’s own card, described by its title', () => {
    const post = article();

    const image = postShareImage(post);

    expect(image.url.startsWith(`/og/blog/${post.slug}.png?v=`)).toBe(true);
    expect(image.alt).toBe(post.title);
  });
});

describe('indexDescription', () => {
  it('counts the first page from one', () => {
    expect(indexDescription(1, 13)).toContain(': 1–4 of 13, newest first.');
  });

  it('stops a short last page at the last post', () => {
    expect(indexDescription(4, 13)).toContain(': 13–13 of 13, newest first.');
  });
});

describe('tagDescription', () => {
  it('counts the posts and names the newest', () => {
    const posts = [{ title: 'Newest' }, { title: 'Older' }];

    expect(tagDescription('ci', posts)).toBe(
      '2 posts tagged ci, newest first. Latest: Newest.',
    );
  });

  it('says post, not posts, for one', () => {
    expect(tagDescription('ci', [{ title: 'Only' }])).toBe(
      '1 post tagged ci, newest first. Latest: Only.',
    );
  });

  it('names no newest post when there is none', () => {
    expect(tagDescription('ci', [])).toBe('0 posts tagged ci.');
  });
});

const props = <P>(params: P) => ({
  params: Promise.resolve(params),
  searchParams: Promise.resolve({}),
});

const STATIC_PAGES: Record<string, Metadata> = {
  '/': homeMetadata,
  '/blog': blogMetadata,
  '/about': aboutMetadata,
  '/changelog': changelogMetadata,
};

/** The metadata the page at a sitemap address hands Next. */
async function metadataAt(pathname: string): Promise<Metadata> {
  const [, section, param, rest] = pathname.split('/');
  const known = STATIC_PAGES[pathname];

  if (known) return known;
  if (section === 'tags' && param) return tagMetadata(props({ tag: param }));
  if (param === 'page' && rest) return laterPageMetadata(props({ n: rest }));
  if (param) return postMetadata(props({ slug: param }));

  throw new Error(`no page is known to answer ${pathname}`);
}

async function everyPublishedPage() {
  return Promise.all(
    sitemap().map(async ({ url }) => {
      const pathname = new URL(url).pathname;
      return { pathname, metadata: await metadataAt(pathname) };
    }),
  );
}

function duplicatesIn(values: unknown[]): unknown[] {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

describe('every page in the sitemap', () => {
  it('previews at its own address', async () => {
    const pages = await everyPublishedPage();

    const misnamed = pages.filter(
      ({ pathname, metadata }) =>
        new URL(String(metadata.openGraph?.url), SITE_URL).pathname !== pathname,
    );

    expect(misnamed).toEqual([]);
  });

  it('shares no headline with another page', async () => {
    const pages = await everyPublishedPage();

    expect(duplicatesIn(pages.map(({ metadata }) => metadata.openGraph?.title))).toEqual(
      [],
    );
  });

  it('shares no description with another page', async () => {
    const pages = await everyPublishedPage();

    expect(duplicatesIn(pages.map(({ metadata }) => metadata.description))).toEqual([]);
  });

  it('gives every post a card no other post has', async () => {
    const pages = await everyPublishedPage();

    const cards = pages
      .filter(({ metadata }) => openGraphOf(metadata).type === 'article')
      .map(({ metadata }) => JSON.stringify(metadata.openGraph?.images));

    expect(cards).toHaveLength(getAllPosts().length);
    expect(duplicatesIn(cards)).toEqual([]);
  });
});
