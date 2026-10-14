import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import { GET } from '../app/og/site.png/route';
import { config as proxyConfig } from '../proxy';
import { cardVersion, OG_FONT_PATH, SITE_CARD_COPY } from '../lib/og';
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from '../lib/site';

/**
 * The site card's contract, not its pixels: what a crawler reads off the route
 * — the canvas size and the content type — and the font the route hands satori.
 * What the card LOOKS like is the differ's question, never a unit test's.
 */

// Duplicated from lib/og.tsx on purpose: an expectation that imports the value
// under test cannot catch that value being wrong.
const OG_CANVAS = { width: 1200, height: 630 };

/** The canvas as a crawler reads it: off the PNG's own IHDR chunk. */
function pngSize(bytes: Buffer) {
  return {
    chunk: bytes.subarray(12, 16).toString('ascii'),
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

describe('the site card route', () => {
  it('answers the 1200x630 PNG crawlers crop against', async () => {
    const response = await GET();

    const bytes = Buffer.from(await response.arrayBuffer());

    expect(response.headers.get('content-type')).toBe('image/png');
    expect(pngSize(bytes)).toEqual({ chunk: 'IHDR', ...OG_CANVAS });
  });

  it('draws the words the console already says about itself', () => {
    expect(SITE_CARD_COPY).toEqual({
      title: APP_NAME,
      meta: APP_DESCRIPTION,
      tagline: APP_TAGLINE,
    });
  });
});

describe('cardVersion', () => {
  it('is stable for the same words', () => {
    const first = cardVersion(SITE_CARD_COPY);

    const second = cardVersion({ ...SITE_CARD_COPY });

    expect(second).toBe(first);
  });

  it('moves with the words', () => {
    const before = cardVersion(SITE_CARD_COPY);

    const after = cardVersion({ ...SITE_CARD_COPY, meta: `${SITE_CARD_COPY.meta}!` });

    expect(after).not.toBe(before);
  });
});

describe('the display face', () => {
  // The file tracer ships a symlinked file under its target only, so a read
  // through `node_modules/@gate/ui` is ENOENT on a deployment (#495).
  it('is read at its real path, through no workspace link', () => {
    expect(OG_FONT_PATH).toBe(fs.realpathSync(OG_FONT_PATH));
    expect(OG_FONT_PATH).not.toContain('node_modules');
  });

  it('travels with the site card route', async () => {
    const configPath = path.resolve(import.meta.dirname, '..', 'next.config.mjs');

    const { default: config } = await import(pathToFileURL(configPath).href);

    const included: string[] = config.outputFileTracingIncludes['/og/site.png'];
    expect(included.map((file) => path.resolve(file))).toContain(OG_FONT_PATH);
  });
});

describe('the card address', () => {
  // A crawler that is rewritten or redirected on its way to the card gets no
  // card. Every matcher starts with a literal segment, so a prefix names it.
  it('is reached by no proxy matcher', () => {
    const caught = proxyConfig.matcher.filter((pattern) => !/^\/[a-z]+\//.test(pattern));

    expect(caught).toEqual([]);
    expect(proxyConfig.matcher.filter((pattern) => pattern.startsWith('/og/'))).toEqual(
      [],
    );
  });
});
