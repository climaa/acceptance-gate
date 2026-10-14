import type { Metadata } from 'next';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import { metadata as consoleMetadata } from '../app/page';
import { generateMetadata as reportMetadata } from '../app/report/[id]/page';
import { generateMetadata as setMetadata } from '../app/set/[label]/page';
import { pageMetadata, SITE_SHARE_IMAGE } from '../lib/share';
import { APP_DESCRIPTION, APP_NAME, NOT_FOUND_TITLE, SITE_OPEN_GRAPH } from '../lib/site';

/**
 * What a pasted link to the console previews as: the tags a crawler reads off
 * `<head>`, as the metadata each page hands Next. Measured on production before
 * this existed, `/` carried no og:url, no og:image and no canonical — the shape
 * a fetcher previews as the bare host.
 */

// Duplicated from lib/og.tsx on purpose, as og-card.test.ts does: an
// expectation that imports the value under test cannot catch it being wrong.
const CARD = { width: 1200, height: 630, type: 'image/png' };

const REPORT = 'main-2026-08-17__main-2026-08-13';
const SET = 'main-2026-08-17';

const PAGE = { path: '/somewhere', title: 'Somewhere', description: 'A page.' };

type OpenGraphWithType = NonNullable<Metadata['openGraph']> & { type?: string };
type TwitterWithCard = NonNullable<Metadata['twitter']> & { card?: string };

const openGraphOf = (metadata: Metadata) => metadata.openGraph as OpenGraphWithType;
const twitterOf = (metadata: Metadata) => metadata.twitter as TwitterWithCard;

const forReport = (id: string) =>
  reportMetadata({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });

const forSet = (label: string) =>
  setMetadata({ params: Promise.resolve({ label }), searchParams: Promise.resolve({}) });

describe('pageMetadata', () => {
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

  it('previews under the document title the layout template produces', () => {
    const metadata = pageMetadata(PAGE);

    expect(metadata.openGraph?.title).toBe(`Somewhere · ${APP_NAME}`);
  });

  it('previews an absolute title as itself', () => {
    const metadata = pageMetadata({ ...PAGE, title: { absolute: 'Whole' } });

    expect(metadata.openGraph?.title).toBe('Whole');
  });

  it('shares the site card at the size crawlers crop against, with alt text', () => {
    const metadata = pageMetadata(PAGE);

    expect(metadata.openGraph?.images).toEqual([{ ...SITE_SHARE_IMAGE, ...CARD }]);
    expect(SITE_SHARE_IMAGE.alt).not.toBe('');
  });

  it('versions the card address, so a reworded card is fetched afresh', () => {
    expect(SITE_SHARE_IMAGE.url).toMatch(/^\/og\/site\.png\?v=[0-9a-f]{12}$/);
  });

  it('mirrors Open Graph on twitter:*, as a large-image card', () => {
    const metadata = pageMetadata(PAGE);
    const openGraph = openGraphOf(metadata);

    expect(twitterOf(metadata)).toEqual({
      card: 'summary_large_image',
      title: openGraph.title,
      description: openGraph.description,
      images: openGraph.images,
    });
  });
});

describe('each page names its own preview', () => {
  it('previews the console under its own title and description', () => {
    expect(consoleMetadata.alternates?.canonical).toBe('/');
    expect(consoleMetadata.openGraph?.url).toBe('/');
    expect(consoleMetadata.openGraph?.title).toBe(APP_NAME);
    expect(consoleMetadata.description).toBe(APP_DESCRIPTION);
  });

  it('names the report in the title and the address', async () => {
    const metadata = await forReport(REPORT);

    expect(metadata.title).toBe(REPORT);
    expect(metadata.openGraph?.title).toContain(REPORT);
    expect(metadata.openGraph?.url).toBe(`/report/${REPORT}`);
  });

  // The two sides are what the report's header draws beside its id.
  it('describes the report by the two sets it compares', async () => {
    const metadata = await forReport(REPORT);

    expect(metadata.description).toContain('main-2026-08-13');
    expect(metadata.description).toContain('main-2026-08-17');
  });

  it('names the set in the title and the address', async () => {
    const metadata = await forSet(SET);

    expect(metadata.title).toBe(SET);
    expect(metadata.openGraph?.title).toContain(SET);
    expect(metadata.openGraph?.url).toBe(`/set/${SET}`);
  });

  it.each([
    ['/', async () => consoleMetadata],
    ['/report/[id]', () => forReport(REPORT)],
    ['/set/[label]', () => forSet(SET)],
  ])('%s has a canonical equal to its og:url', async (_route, metadataOf) => {
    const metadata = await metadataOf();

    expect(metadata.alternates?.canonical).toBe(metadata.openGraph?.url);
  });

  it('shares no title or address between the three pages', async () => {
    const all = [consoleMetadata, await forReport(REPORT), await forSet(SET)];

    expect(new Set(all.map((page) => page.openGraph?.title)).size).toBe(3);
    expect(new Set(all.map((page) => page.openGraph?.url)).size).toBe(3);
  });

  // A refused segment is not a page, so it has no address to preview under —
  // and echoing it into og:url would remember it after all.
  it.each([
    ['a report id', () => forReport('../../../etc/passwd')],
    ['a set label', () => forSet('../../../etc/passwd')],
  ])('previews nothing for a refused %s', async (_what, metadataOf) => {
    const metadata = await metadataOf();

    expect(metadata).toEqual({ title: NOT_FOUND_TITLE });
  });
});
