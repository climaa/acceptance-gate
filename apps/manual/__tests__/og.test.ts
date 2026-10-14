import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cardVersion, loadDisplayFont, OG_FONT_PATH, SITE_CARD_COPY } from '@/lib/og';
import { SITE_DESCRIPTION, SITE_TAGLINE } from '@/lib/site';

/**
 * The site card's contract, not its pixels. What the card LOOKS like is
 * nobody's unit test (CODING_STANDARDS: appearance never gets one); what a
 * crawler reads off the route — the canvas size and the content type — is a
 * contract, and so is the font file the route hands satori, which reads no
 * woff2. `apps/blog/__tests__/og.test.ts` holds the same contract for the blog.
 */

// Duplicated from lib/og.tsx on purpose: an expectation that imports the value
// under test cannot catch that value being wrong.
const OG_CANVAS = { width: 1200, height: 630 };
const OG_MIME = 'image/png';

// TrueType's magic number. A woff2 would start with 'wOF2', which satori
// cannot parse.
const TTF_MAGIC = [0x00, 0x01, 0x00, 0x00];

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

function magicOf(bytes: Buffer): number[] {
  return [...bytes.subarray(0, 4)];
}

// The canvas size as a crawler reads it: off the PNG's own IHDR chunk, not off
// a constant the route exports.
function pngSize(bytes: Buffer) {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function siteCardResponse(): Promise<Response> {
  const { GET } = await import('@/app/og/site.png/route');
  return GET();
}

async function siteCardBytes(): Promise<Buffer> {
  return Buffer.from(await (await siteCardResponse()).arrayBuffer());
}

describe('the site card', () => {
  it('is the 1200x630 canvas crawlers crop against', async () => {
    const bytes = await siteCardBytes();

    expect(pngSize(bytes)).toEqual(OG_CANVAS);
  });

  it('is PNG bytes', async () => {
    const bytes = await siteCardBytes();

    expect(magicOf(bytes)).toEqual(PNG_MAGIC);
  });

  it('is served as the PNG satori emits', async () => {
    const response = await siteCardResponse();

    expect(response.headers.get('content-type')).toBe(OG_MIME);
  });

  // The card and the page must not disagree, so both read lib/site.
  it('says the tagline and description the layout already publishes', () => {
    expect(SITE_CARD_COPY).toEqual({ title: SITE_TAGLINE, meta: SITE_DESCRIPTION });
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

  // The file tracer ships a symlinked file under its target only, so a read
  // through the workspace link finds nothing in the deployed function (#495).
  it('is read at its real path, through no symlink the deployment lacks', () => {
    const real = fs.realpathSync(OG_FONT_PATH);

    expect(OG_FONT_PATH).toBe(real);
  });

  it('is TrueType, the one outline format satori parses', async () => {
    const bytes = await loadDisplayFont();

    expect(magicOf(bytes)).toEqual(TTF_MAGIC);
  });

  it('travels with the function that reads it', async () => {
    const configPath = path.resolve(import.meta.dirname, '..', 'next.config.mjs');

    const { default: config } = await import(pathToFileURL(configPath).href);

    const included: string[] = config.outputFileTracingIncludes['/og/site.png'];
    expect(included.map((file) => path.resolve(file))).toContain(OG_FONT_PATH);
  });
});

describe('cardVersion', () => {
  it('is the same for the same words, so an unchanged card keeps its address', () => {
    const copy = { ...SITE_CARD_COPY };

    expect(cardVersion(copy)).toBe(cardVersion(SITE_CARD_COPY));
  });

  // Previews cache by URL: changed words under an unchanged address keep the
  // old card wherever the link was already shared.
  it('moves when the words on the card move', () => {
    const retitled = { ...SITE_CARD_COPY, title: `${SITE_CARD_COPY.title}!` };

    expect(cardVersion(retitled)).not.toBe(cardVersion(SITE_CARD_COPY));
  });
});
