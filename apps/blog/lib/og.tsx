import { readFile } from 'node:fs/promises';
import { cacheLife } from 'next/cache';
import * as path from 'node:path';
import { ImageResponse } from 'next/og';
import { formatDate, type Post } from './posts';
import { SITE_DESCRIPTION, SITE_TAGLINE, SITE_TITLE, SITE_URL } from './site';

/**
 * The shared half of the two `opengraph-image` routes: the frame, the face and
 * the copy rules. Deliberately its own markup rather than `packages/ui`
 * components — satori supports a small CSS subset, the design system targets
 * real browsers, and the two would drift apart the first time either moved.
 */

/** Facebook, X, LinkedIn and Slack all crop to 1.91:1; this is that, doubled. */
export const OG_SIZE = { width: 1200, height: 630 };

/** satori rasterises through resvg, which emits PNG and nothing else. */
export const OG_CONTENT_TYPE = 'image/png';

/**
 * `next/og` reads neither page CSS nor woff2, so the card is handed font bytes
 * directly — `packages/ui/src/fonts/og/` exists for exactly this and documents
 * itself in its own PROVENANCE.md. Resolved through the workspace link, so the
 * path follows the `@gate/ui` dependency edge package.json already declares
 * rather than counting `../` hops out of apps/blog. Off `process.cwd()` because
 * that is the resolution Next's own metadata-route docs use, and both the build
 * worker and vitest run with apps/blog as the working directory.
 */
export const OG_FONT_PATH = path.join(
  process.cwd(),
  'node_modules',
  '@gate/ui',
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
 * Two caches, because they answer two different questions.
 *
 * The module-scope promise is the original one: every prerendered card would
 * otherwise re-read 64 kB, and one build worker renders many cards.
 *
 * `'use cache'` is what makes the route prerender at all. This read is the
 * card's only data access, and under Cache Components an uncached access is
 * what drops `opengraph-image` to on-demand rendering — the cards stop
 * shipping with the deployment and are built on the first crawler request
 * instead, which is exactly what the comment in `[slug]/opengraph-image.tsx`
 * says must not happen.
 *
 * `'max'`: the file is a build artifact, pinned by `outputFileTracingIncludes`
 * in `next.config.mjs`. It cannot change without a new deployment.
 */
export async function loadDisplayFont(): Promise<Buffer> {
  'use cache';
  cacheLife('max');

  displayFont ??= readFile(OG_FONT_PATH);
  return displayFont;
}

/**
 * The one sanctioned exception to "no component hardcodes a visual value":
 * satori resolves no CSS custom properties, so tokens.css cannot reach this
 * file and `var(--color-bg)` would render as nothing. Every literal below is a
 * copy of a light-theme role — the token name is the findable counterpart when
 * the palette moves. Light only: a social card has no `[data-theme]` to read.
 */
const CARD = {
  bg: '#ede6d6', // --color-bg          -> --c-cream-100
  text: '#11120d', // --color-text        -> --c-umber-950
  muted: '#51483f', // --color-text-muted  -> --c-umber-600
  accent: '#713520', // --color-accent      -> --c-terra-500
  border: '#d8cfbc', // --color-border      -> --c-cream-400
};

export interface OgCardCopy {
  /** The display-face line: a post title, or the site's tagline. */
  title: string;
  /** The muted line under it: a publication date, or the site description. */
  meta: string;
}

export const SITE_CARD_COPY: OgCardCopy = {
  title: SITE_TAGLINE,
  meta: SITE_DESCRIPTION,
};

/**
 * Reads the same values the page does, so a card and its post cannot disagree.
 * A slug with no published post still has to produce an image — the route is
 * reachable from a stale inbound link, and a throw here fails the build.
 */
export function postCardCopy(post: Pick<Post, 'title' | 'date'> | null): OgCardCopy {
  if (!post) return SITE_CARD_COPY;

  return { title: post.title, meta: formatDate(post.date) };
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

/** Both routes' renderer: one frame, two sets of copy. */
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
