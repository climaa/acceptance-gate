import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { cacheLife } from 'next/cache';
import * as path from 'node:path';
import { ImageResponse } from 'next/og';
import { SITE_DESCRIPTION, SITE_TAGLINE, SITE_TITLE, SITE_URL } from './site';

/**
 * The manual's social card: the frame `apps/blog/lib/og.tsx` draws, with this
 * site's words. Its own markup rather than `packages/ui` components — satori
 * supports a small CSS subset, the design system targets real browsers, and the
 * two would drift apart the first time either moved. A copy of the blog's
 * rather than an import from it, because an app is not a package.
 */

/** Facebook, X, LinkedIn and Slack all crop to 1.91:1; this is that, doubled. */
export const OG_SIZE = { width: 1200, height: 630 };

/** satori rasterises through resvg, which emits PNG and nothing else. */
export const OG_CONTENT_TYPE = 'image/png';

/**
 * `next/og` reads neither page CSS nor woff2, so the card is handed font bytes
 * directly — `packages/ui/src/fonts/og/` exists for exactly this and documents
 * itself in its own PROVENANCE.md. Off `process.cwd()`, which the build worker,
 * vitest and the deployed function all set to apps/manual.
 *
 * The real path, never the `node_modules/@gate/ui` workspace link. The file
 * tracer records a symlinked file under its target, so the deployed function
 * carries `packages/ui/src/fonts/og/…` and has no `node_modules/@gate/ui` at
 * all: a read through the link is ENOENT on Vercel, which is how the blog's
 * cards answered 500 (#495).
 */
export const OG_FONT_PATH = path.join(
  process.cwd(),
  '..',
  '..',
  'packages',
  'ui',
  'src',
  'fonts',
  'og',
  'Fraunces9pt-SemiBold.ttf',
);

/** Must stay the family name the card's `fontFamily` asks for. */
const OG_FONT_FAMILY = 'Fraunces';

/** SemiBold is the only weight committed under og/, and the board's display step. */
const OG_FONT_WEIGHT = 600;

let displayFont: Promise<Buffer> | undefined;

/**
 * Inside `'use cache'` because this read is the card's only IO, and under Cache
 * Components uncached IO awaited during a request is what makes an on-demand
 * render answer 500 on Vercel while `next start` renders it fine. `'max'`: the
 * file is pinned into the function by `outputFileTracingIncludes` in
 * `next.config.mjs` and cannot change without a new deployment.
 */
export async function loadDisplayFont(): Promise<Buffer> {
  'use cache';
  cacheLife('max');

  displayFont ??= readFile(OG_FONT_PATH);
  return displayFont;
}

/**
 * satori resolves no CSS custom properties, so tokens.css cannot reach this
 * file. Every literal is a copy of a light-theme role, named beside it, exactly
 * as in `apps/blog/lib/og.tsx`. Light only: a card has no `[data-theme]`.
 */
const CARD = {
  bg: '#ede6d6', // --color-bg          -> --c-cream-100
  text: '#11120d', // --color-text        -> --c-umber-950
  muted: '#51483f', // --color-text-muted  -> --c-umber-600
  accent: '#713520', // --color-accent      -> --c-terra-500
  border: '#d8cfbc', // --color-border      -> --c-cream-400
};

export interface OgCardCopy {
  /** The display-face line. */
  title: string;
  /** The muted line under it. */
  meta: string;
}

export const SITE_CARD_COPY: OgCardCopy = {
  title: SITE_TAGLINE,
  meta: SITE_DESCRIPTION,
};

/** Where the site card is served. Every page shares it. */
export const SITE_CARD_PATH = '/og/site.png';

/**
 * A short digest of what the card draws, for the `?v=` on its address.
 *
 * Link previews cache an image by its URL, for days. A card whose words change
 * under an unchanged URL keeps showing the old words wherever the link was
 * already shared; a URL that moves with the copy is fetched afresh.
 */
export function cardVersion(copy: OgCardCopy): string {
  return createHash('sha256').update(JSON.stringify(copy)).digest('hex').slice(0, 12);
}

function OgCard({ title, meta }: OgCardCopy) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px 80px',
        backgroundColor: CARD.bg,
        color: CARD.text,
        fontFamily: OG_FONT_FAMILY,
      }}
    >
      <div
        style={{
          display: 'flex',
          width: 96,
          height: 10,
          borderRadius: 9999,
          backgroundColor: CARD.accent,
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{ display: 'flex', fontSize: 60, lineHeight: 1.15, letterSpacing: -1.5 }}
        >
          {title}
        </div>
        <div style={{ display: 'flex', marginTop: 28, fontSize: 28, color: CARD.muted }}>
          {meta}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          paddingTop: 28,
          borderTop: `2px solid ${CARD.border}`,
          fontSize: 26,
          color: CARD.accent,
        }}
      >
        <span>{SITE_TITLE}</span>
        <span style={{ color: CARD.muted }}>{SITE_URL.host}</span>
      </div>
    </div>
  );
}

export async function ogImageResponse(copy: OgCardCopy): Promise<ImageResponse> {
  return new ImageResponse(<OgCard {...copy} />, {
    ...OG_SIZE,
    fonts: [
      {
        name: OG_FONT_FAMILY,
        data: await loadDisplayFont(),
        weight: OG_FONT_WEIGHT,
        style: 'normal',
      },
    ],
  });
}
