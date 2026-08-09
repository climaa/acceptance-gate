import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
// Imported explicitly rather than relying on `globals: true` — same reason as
// content.test.ts: tsconfig's `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import { loadDisplayFont, OG_FONT_PATH, postCardCopy, SITE_CARD_COPY } from '../lib/og';
import { formatDate, getAllPosts } from '../lib/posts';
import { SITE_DESCRIPTION, SITE_TAGLINE } from '../lib/site';

/**
 * The OG routes' contract, not their pixels. What a social card LOOKS like is
 * the differ's job (CODING_STANDARDS: appearance never gets a unit test); what
 * a crawler reads off the route — the canvas size and the content type — is a
 * contract, and so is the font file the route hands satori. `next/og` reads
 * neither page CSS nor woff2, so a missing or moved TTF is not a style
 * regression, it is a build that renders every card in satori's default face
 * without telling anyone.
 */

// Duplicated from lib/og.tsx on purpose: an expectation that imports the value
// under test cannot catch that value being wrong. 1200x630 is the size every
// crawler crops against, and satori only ever emits PNG.
const OG_CANVAS = { width: 1200, height: 630 };
const OG_MIME = 'image/png';

// TrueType's magic number: 0x00010000. A woff2 would start with 'wOF2', which
// satori cannot parse — this is what keeps og/ genuinely exempt and not just
// stale.
const TTF_MAGIC = [0x00, 0x01, 0x00, 0x00];

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

function magicOf(bytes: Buffer): number[] {
  return [...bytes.subarray(0, 4)];
}

const ROUTES = [
  ['app/opengraph-image', () => import('../app/opengraph-image')],
  ['app/blog/[slug]/opengraph-image', () => import('../app/blog/[slug]/opengraph-image')],
] as const;

describe.each(ROUTES)('%s', (_name, load) => {
  it('declares the 1200x630 canvas crawlers crop against', async () => {
    const route = await load();

    expect(route.size).toEqual(OG_CANVAS);
  });

  it('declares the PNG satori emits', async () => {
    const route = await load();

    expect(route.contentType).toBe(OG_MIME);
  });

  it('carries alt text, since the card is an image of words', async () => {
    const route = await load();

    expect(route.alt.length).toBeGreaterThan(0);
  });
});

describe('the OG display face', () => {
  it('is the TTF @gate/ui documents as the one woff2 exemption', () => {
    const exemption = path.join(
      '@gate',
      'ui',
      'src',
      'fonts',
      'og',
      'Fraunces9pt-SemiBold.ttf',
    );

    expect(OG_FONT_PATH.endsWith(exemption)).toBe(true);
  });

  it('exists on disk at the path the routes read', () => {
    expect(fs.existsSync(OG_FONT_PATH)).toBe(true);
  });

  it('is TrueType, the one outline format satori parses', async () => {
    const bytes = await loadDisplayFont();

    expect(magicOf(bytes)).toEqual(TTF_MAGIC);
  });

  it('reads the file once, not per request', async () => {
    const first = await loadDisplayFont();

    const second = await loadDisplayFont();

    expect(second).toBe(first);
  });

  // A prerendered card carries its own bytes, but /blog/<unknown>/opengraph-image
  // renders on demand and reads the TTF then — off a path no bundler can trace.
  it('travels with the function that reads it at request time', async () => {
    const configPath = path.resolve(__dirname, '..', 'next.config.mjs');

    const { default: config } = await import(pathToFileURL(configPath).href);

    expect(config.outputFileTracingIncludes['/blog/[slug]/opengraph-image']).toContain(
      `./${path.relative(process.cwd(), OG_FONT_PATH)}`,
    );
  });
});

/**
 * Not an appearance assertion — what the card looks like is the differ's, and
 * these two say nothing about it. They pin the contract one layer under: satori
 * accepts this markup and these font bytes, so the route emits an image instead
 * of throwing halfway through a prerender.
 */
describe('the rendered card', () => {
  it('is PNG bytes for the site card', async () => {
    const { default: Image } = await import('../app/opengraph-image');

    const response = await Image();

    expect(magicOf(Buffer.from(await response.arrayBuffer()))).toEqual(PNG_MAGIC);
  });

  // The fallback path end to end: /blog/<unknown>/opengraph-image is reachable,
  // and a throw there is a failed build, not a missing image.
  it('is PNG bytes for a slug with no published post', async () => {
    const { default: Image } = await import('../app/blog/[slug]/opengraph-image');

    const response = await Image({ params: Promise.resolve({ slug: 'no-such-post' }) });

    expect(magicOf(Buffer.from(await response.arrayBuffer()))).toEqual(PNG_MAGIC);
  });
});

describe('postCardCopy', () => {
  it('takes its title and date from the post the page renders', () => {
    const post = getAllPosts()[0];
    if (!post) throw new Error('content/posts publishes no post to build a card from');

    const copy = postCardCopy(post);

    expect(copy.title).toBe(post.title);
    expect(copy.meta).toBe(formatDate(post.date));
  });

  // /blog/<anything> is reachable without a matching post — a stale inbound
  // link, or a draft whose page 404s in production. The card still has to be an
  // image rather than a build-time throw.
  it('falls back to the site card when the slug has no published post', () => {
    const copy = postCardCopy(null);

    expect(copy).toEqual(SITE_CARD_COPY);
  });
});

describe('SITE_CARD_COPY', () => {
  // The card and the page must not disagree, so both read lib/site.
  it('reuses the tagline and description the metadata already publishes', () => {
    expect(SITE_CARD_COPY.title).toBe(SITE_TAGLINE);
    expect(SITE_CARD_COPY.meta).toBe(SITE_DESCRIPTION);
  });
});
