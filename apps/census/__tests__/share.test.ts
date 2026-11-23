import { describe, expect, it } from 'vitest';

import { generateMetadata as workspaceMetadata } from '@/app/[workspace]/page';
import { metadata as homeMetadata } from '@/app/page';
import { pageMetadata, SITE_SHARE_IMAGE } from '@/lib/share.ts';
import { SITE_OPEN_GRAPH, SITE_TITLE, SITE_URL } from '@/lib/site.ts';

/**
 * What a pasted link to census previews as: the tags a crawler reads off
 * `<head>`, as the metadata the pages hand Next. Whether those tags land inside
 * `<head>` for each crawler is the deployed site's to show, and is checked
 * there. `apps/manual/__tests__/share.test.ts` holds the same contract.
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

    expect(metadata.openGraph?.title).toBe(metadata.title);
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

describe('the site origin', () => {
  // A metadataBase on a host that does not answer breaks every absolute URL.
  it('is the custom domain, over https', () => {
    expect(SITE_URL.href).toBe('https://census.carloslima.dev/');
  });
});

describe('the published pages', () => {
  it('preview the home at /', () => {
    expect(homeMetadata.openGraph?.url).toBe('/');
    expect(homeMetadata.title).toBe(SITE_TITLE);
  });

  it('preview a workspace at its own address, under its own name', async () => {
    const metadata = await workspaceMetadata({
      params: Promise.resolve({ workspace: 'census' }),
    } as PageProps<'/[workspace]'>);

    expect(metadata.openGraph?.url).toBe('/census');
    expect(metadata.alternates?.canonical).toBe('/census');
    expect(String(metadata.title)).toMatch(/ · Census$/);
  });

  // The error path: an address that names no workspace still gets a title,
  // and the layout's preview rather than one claiming an address that 404s.
  it('fall back to the site title for an unknown workspace', async () => {
    const metadata = await workspaceMetadata({
      params: Promise.resolve({ workspace: 'no-such-workspace' }),
    } as PageProps<'/[workspace]'>);

    expect(metadata).toEqual({ title: SITE_TITLE });
  });
});
