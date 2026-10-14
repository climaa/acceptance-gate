import type { Metadata } from 'next';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { describe, expect, it } from 'vitest';
import { generateMetadata as manualPageMetadata } from '@/app/[slug]/page';
import { metadata as indexMetadata } from '@/app/page';
import sitemap from '@/app/sitemap';
import { metadata as tourMetadata } from '@/app/start/page';
import { pageMetadata, SITE_SHARE_IMAGE } from '@/lib/share';
import { SITE_OPEN_GRAPH, SITE_URL } from '@/lib/site';
import { config as proxyConfig } from '../proxy';

/**
 * What a pasted link to the manual previews as: the tags a crawler reads off
 * `<head>`, as the metadata the pages hand Next. Whether those tags land inside
 * `<head>` for each crawler is the deployed site's to show, and is checked
 * there. `apps/blog/__tests__/share.test.ts` holds the same contract.
 */

// Duplicated from lib/og.tsx on purpose: an expectation that imports the value
// under test cannot catch that value being wrong.
const CARD = { width: 1200, height: 630, type: 'image/png' };

const PAGE = { path: '/somewhere', title: 'Somewhere', description: 'A page.' };

describe('pageMetadata', () => {
  // A page with no og:url previewed as the bare host.
  it('names the page as both its canonical and its og:url', () => {
    const metadata = pageMetadata(PAGE);

    expect(metadata.alternates?.canonical).toBe(PAGE.path);
    expect(metadata.openGraph?.url).toBe(PAGE.path);
  });

  // Next merges metadata shallowly: an `openGraph` without these loses them.
  it('keeps the site-wide Open Graph fields', () => {
    const metadata = pageMetadata(PAGE);

    expect(metadata.openGraph).toMatchObject(SITE_OPEN_GRAPH);
  });

  it('heads the preview with the title the tab shows', () => {
    const metadata = pageMetadata(PAGE);

    expect(metadata.openGraph?.title).toBe('Somewhere · Visual-diff manual');
  });

  it('heads the preview with an absolute title as written', () => {
    const metadata = pageMetadata({ ...PAGE, title: { absolute: 'Whole title' } });

    expect(metadata.openGraph?.title).toBe('Whole title');
  });

  it('shares the site card, at its canvas size, with alt text', () => {
    const metadata = pageMetadata(PAGE);

    expect(metadata.openGraph?.images).toEqual([{ ...SITE_SHARE_IMAGE, ...CARD }]);
    expect(SITE_SHARE_IMAGE.alt).not.toBe('');
  });

  // Previews cache by URL, so the address has to move with the words.
  it('names the card at a versioned address', () => {
    expect(SITE_SHARE_IMAGE.url).toMatch(/^\/og\/site\.png\?v=[0-9a-f]+$/);
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
});

const STATIC_PAGES: Record<string, Metadata> = {
  '/': indexMetadata,
  '/start': tourMetadata,
};

/** The metadata the page at a sitemap address hands Next. */
async function metadataAt(pathname: string): Promise<Metadata> {
  const known = STATIC_PAGES[pathname];
  if (known) return known;

  const [, slug] = pathname.split('/');
  if (!slug) throw new Error(`no page is known to answer ${pathname}`);

  return manualPageMetadata({ params: Promise.resolve({ slug }) });
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
  it('previews at its own address, which is its canonical', async () => {
    const pages = await everyPublishedPage();

    const misnamed = pages.filter(
      ({ pathname, metadata }) =>
        new URL(String(metadata.openGraph?.url), SITE_URL).pathname !== pathname ||
        metadata.alternates?.canonical !== metadata.openGraph?.url,
    );

    expect(misnamed).toEqual([]);
  });

  it('keeps the site-wide Open Graph fields', async () => {
    const pages = await everyPublishedPage();

    for (const { metadata } of pages) {
      expect(metadata.openGraph).toMatchObject(SITE_OPEN_GRAPH);
    }
  });

  it('says the same thing to X as to everyone else', async () => {
    const pages = await everyPublishedPage();

    for (const { metadata } of pages) {
      expect(metadata.twitter).toMatchObject({
        card: 'summary_large_image',
        title: metadata.openGraph?.title,
        description: metadata.openGraph?.description,
        images: metadata.openGraph?.images,
      });
    }
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

  it('shares no address with another page', async () => {
    const pages = await everyPublishedPage();

    expect(duplicatesIn(pages.map(({ metadata }) => metadata.openGraph?.url))).toEqual(
      [],
    );
  });
});

describe('the proxy', () => {
  // A card refused as an unknown slug would be a 404 where a crawler wants an
  // image.
  it('never sees the card', () => {
    const matched = unstable_doesMiddlewareMatch({
      config: proxyConfig,
      url: '/og/site.png',
    });

    expect(matched).toBe(false);
  });
});
