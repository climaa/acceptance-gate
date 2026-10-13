import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
// Imported explicitly rather than relying on `globals: true` — same reason as
// content.test.ts: tsconfig's `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import {
  cardVersion,
  loadDisplayFont,
  OG_FONT_PATH,
  postCardCopy,
  postCardParam,
  postCardPath,
  SITE_CARD_COPY,
  slugOfCardParam,
} from '../lib/og';
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

// The canvas size and the MIME type, as a crawler reads them: off the PNG's
// own IHDR chunk and the response header, not off a constant the route exports.
function pngSize(bytes: Buffer) {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function bytesOf(response: Response): Promise<Buffer> {
  return Buffer.from(await response.arrayBuffer());
}

async function siteCardResponse(): Promise<Response> {
  const { GET } = await import('../app/og/site.png/route');
  return GET();
}

async function postCardResponse(card: string): Promise<Response> {
  const { GET } = await import('../app/og/blog/[card]/route');
  return GET(new Request(`https://example.test/og/blog/${card}`), {
    params: Promise.resolve({ card }),
  });
}

const [PUBLISHED] = getAllPosts();

function publishedPost() {
  if (!PUBLISHED) throw new Error('content/posts publishes no post to build a card from');
  return PUBLISHED;
}

describe.each([
  ['the site card', siteCardResponse],
  ['a post card', () => postCardResponse(postCardParam(publishedPost().slug))],
])('%s', (_name, respond) => {
  it('is the 1200x630 canvas crawlers crop against', async () => {
    const response = await respond();

    expect(pngSize(await bytesOf(response))).toEqual(OG_CANVAS);
  });

  it('is served as the PNG satori emits', async () => {
    const response = await respond();

    expect(response.headers.get('content-type')).toBe(OG_MIME);
  });
});

describe('the OG display face', () => {
  it('is the TTF @gate/ui documents as the one woff2 exemption', () => {
    const exemption = path.join(
      'packages',
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

  // The file tracer ships a symlinked file under its target only, so a read
  // through the workspace link finds nothing in the deployed function.
  it('is read at its real path, through no symlink the deployment lacks', () => {
    const real = fs.realpathSync(OG_FONT_PATH);

    expect(OG_FONT_PATH).toBe(real);
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

  // A prerendered card carries its own bytes, but /og/blog/<unknown>.png
  // renders on demand and reads the TTF then — off a path no bundler can trace.
  it('travels with the function that reads it at request time', async () => {
    const configPath = path.resolve(__dirname, '..', 'next.config.mjs');

    const { default: config } = await import(pathToFileURL(configPath).href);

    const included: string[] = config.outputFileTracingIncludes['/og/blog/[card]'];

    expect(included.map((file) => path.resolve(file))).toContain(OG_FONT_PATH);
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
    const png = await bytesOf(await siteCardResponse());

    expect(magicOf(png)).toEqual(PNG_MAGIC);
  });

  it('draws a post differently from the site card', async () => {
    const site = await bytesOf(await siteCardResponse());

    const post = await bytesOf(
      await postCardResponse(postCardParam(publishedPost().slug)),
    );

    expect(post.equals(site)).toBe(false);
  });

  // A link shared before a post was renamed or unpublished still points here,
  // and a preview holding it should show an image rather than an error.
  it('is the site card for a slug with no published post', async () => {
    const site = await bytesOf(await siteCardResponse());

    const fallback = await bytesOf(await postCardResponse(postCardParam('no-such-post')));

    expect(fallback.equals(site)).toBe(true);
  });

  it('is the site card for an address that names no card', async () => {
    const site = await bytesOf(await siteCardResponse());

    const fallback = await bytesOf(await postCardResponse(publishedPost().slug));

    expect(fallback.equals(site)).toBe(true);
  });
});

describe('the post card route', () => {
  it('prerenders a card for every published post', async () => {
    const { generateStaticParams } = await import('../app/og/blog/[card]/route');

    const params = generateStaticParams();

    expect(params).toEqual(getAllPosts().map((post) => ({ card: `${post.slug}.png` })));
  });
});

describe('the card address', () => {
  it('names a post by its slug, as a .png', () => {
    expect(postCardPath('a-post')).toBe('/og/blog/a-post.png');
  });

  it('reads the slug back out of its own segment', () => {
    expect(slugOfCardParam(postCardParam('a-post'))).toBe('a-post');
  });

  it('reads no slug out of a segment that is not a card', () => {
    expect(slugOfCardParam('a-post')).toBeNull();
  });
});

describe('cardVersion', () => {
  it('is the same for the same copy, so an unchanged card keeps its address', () => {
    const copy = postCardCopy(publishedPost());

    expect(cardVersion({ ...copy })).toBe(cardVersion(copy));
  });

  // Previews cache by URL: a retitled post under an unchanged address would keep
  // its old card wherever the link was already shared.
  it('moves when the words on the card move', () => {
    const copy = postCardCopy(publishedPost());

    const retitled = cardVersion({ ...copy, title: `${copy.title}!` });

    expect(retitled).not.toBe(cardVersion(copy));
  });
});

describe('postCardCopy', () => {
  it('takes its title and date from the post the page renders', () => {
    const post = getAllPosts()[0];
    if (!post) throw new Error('content/posts publishes no post to build a card from');

    const copy = postCardCopy(post);

    expect(copy.title).toBe(post.title);
    expect(copy.meta).toBe(formatDate(post.date));
    expect(copy.tags).toEqual(post.tags);
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
