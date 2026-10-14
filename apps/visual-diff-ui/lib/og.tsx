/* eslint-disable @next/next/no-img-element -- satori draws `<img>` and nothing
   else; `next/image` has no meaning inside an `ImageResponse`. */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { cacheLife, cacheTag } from 'next/cache';
import { ImageResponse } from 'next/og';
import { comparisonCopy, readComparison } from './comparison-meta';
import { resolveShotPath } from './data';
import { absentShotCopy, type ShotKind, shotSources } from './shots';
import type { Variant } from './summary';
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE, SITE_URL } from './site';
import { reportTag } from './tags';

/**
 * The console's two link-preview cards. A comparison's: before, diff and after
 * side by side, under the sentence the modal's heading says. And the site card,
 * which every other page shares: the console's name and what it is for.
 *
 * Its own markup rather than the modal's components, for the reason the blog's
 * card gives: satori supports a small CSS subset, the design system targets real
 * browsers, and the two would drift apart the first time either moved.
 */

/** The 1.91:1 every unfurler crops to, doubled. */
export const OG_SIZE = { width: 1200, height: 630 };

export const OG_CONTENT_TYPE = 'image/png';

export const OG_ALT = 'Before, diff and after of one visual comparison';

/**
 * How long a card may be reused outside this server: an hour in a browser, a
 * year on the CDN. The CDN's copy is per deployment, so it cannot outlive the
 * data it was drawn from; a browser's could, on a console whose report was
 * re-run under the same id, which is why its hour is short.
 */
export const CARD_CACHE_CONTROL = 'public, max-age=3600, s-maxage=31536000';

/**
 * The committed display face — `next/og` reads neither page CSS nor woff2, and
 * `packages/ui/src/fonts/og/` is the one documented TTF exemption for exactly
 * this. The real path, never the `node_modules/@gate/ui` link: the file tracer
 * records a symlinked file under its target, so a read through the link is
 * ENOENT on a deployment (the blog's cards answered 500 until #495).
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

const OG_FONT_FAMILY = 'Fraunces';

let displayFont: Promise<Buffer> | undefined;

/**
 * The face's bytes, read once per process and inside a cache scope.
 *
 * `'use cache'` because under `cacheComponents` an uncached read during a
 * request is what a route answers 500 for on a deployment; `'max'` because the
 * file is pinned by `outputFileTracingIncludes` and cannot change without a new
 * one.
 */
export async function loadDisplayFont(): Promise<Buffer> {
  'use cache';
  cacheLife('max');

  displayFont ??= readFile(OG_FONT_PATH);
  return displayFont;
}

/**
 * satori resolves no custom properties, so tokens.css cannot reach this file —
 * the one sanctioned place a literal colour stands in for a token. Each is a
 * copy of a light-theme role; the token is the findable counterpart when the
 * palette moves. Light only: a card has no `[data-theme]` to read.
 */
const CARD = {
  bg: '#ede6d6', // --color-bg          -> --c-cream-100
  text: '#11120d', // --color-text        -> --c-umber-950
  muted: '#51483f', // --color-text-muted  -> --c-umber-600
  accent: '#713520', // --color-accent      -> --c-terra-500
  border: '#d8cfbc', // --color-border      -> --c-cream-400
  surface: '#f5efe0', // a panel well       -> --c-cream-50
};

/** Both cards' one face, as `ImageResponse` takes it. */
async function cardFonts() {
  return [
    {
      name: OG_FONT_FAMILY,
      data: await loadDisplayFont(),
      weight: 600 as const,
      style: 'normal' as const,
    },
  ];
}

/** The three panels, in the order the comparison reads: A, what moved, B. */
const PANELS: readonly { kind: ShotKind; label: string }[] = [
  { kind: 'baseline', label: 'before' },
  { kind: 'diff', label: 'diff' },
  { kind: 'candidate', label: 'after' },
];

/** One panel's picture, as a data URL, or the modal's sentence for its absence. */
type PanelShot = { src: string } | { absent: string };

async function panelShot(
  dataDir: string,
  reportId: string,
  variant: Variant,
  kind: ShotKind,
): Promise<PanelShot> {
  const absent = { absent: absentShotCopy(variant, kind) };
  if (shotSources(reportId, variant)[kind] === undefined) return absent;

  const file = resolveShotPath(dataDir, reportId, `${variant.key}.${kind}.png`);
  if (!file) return absent;

  try {
    const bytes = await readFile(file);
    return { src: `data:image/png;base64,${bytes.toString('base64')}` };
  } catch {
    return absent;
  }
}

const PANEL_WIDTH = 344;
const PANEL_HEIGHT = 360;

function Panel({ label, shot }: { label: string; shot: PanelShot }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', fontSize: 22, color: CARD.muted }}>{label}</div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: PANEL_WIDTH,
          height: PANEL_HEIGHT,
          backgroundColor: CARD.surface,
          border: `2px solid ${CARD.border}`,
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        {'src' in shot ? (
          <img
            src={shot.src}
            alt={label}
            width={PANEL_WIDTH - 16}
            height={PANEL_HEIGHT - 16}
            style={{ objectFit: 'contain', objectPosition: 'top' }}
          />
        ) : (
          <div style={{ display: 'flex', fontSize: 22, color: CARD.muted }}>
            {shot.absent}
          </div>
        )}
      </div>
    </div>
  );
}

export interface ComparisonCard {
  title: string;
  reportId: string;
  host: string;
  panels: readonly { label: string; shot: PanelShot }[];
}

function Card({ title, reportId, host, panels }: ComparisonCard) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '40px 56px',
        backgroundColor: CARD.bg,
        color: CARD.text,
        fontFamily: OG_FONT_FAMILY,
      }}
    >
      <div style={{ display: 'flex', fontSize: 40, letterSpacing: -1 }}>{title}</div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {panels.map((panel) => (
          <Panel key={panel.label} label={panel.label} shot={panel.shot} />
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          paddingTop: 16,
          borderTop: `2px solid ${CARD.border}`,
          fontSize: 22,
          color: CARD.accent,
        }}
      >
        <span>{reportId}</span>
        <span style={{ color: CARD.muted }}>{host}</span>
      </div>
    </div>
  );
}

/** The three panels a variant's card draws, read off the data directory. */
export function readPanels(
  dataDir: string,
  reportId: string,
  variant: Variant,
): Promise<ComparisonCard['panels']> {
  return Promise.all(
    PANELS.map(async ({ kind, label }) => ({
      label,
      shot: await panelShot(dataDir, reportId, variant, kind),
    })),
  );
}

export async function comparisonCardResponse(
  card: ComparisonCard,
): Promise<ImageResponse> {
  return new ImageResponse(<Card {...card} />, {
    ...OG_SIZE,
    fonts: await cardFonts(),
  });
}

/**
 * One comparison's card as PNG bytes, or null when the report holds no such
 * comparison.
 *
 * Cached for as long as the report is: a card reads three screenshots, encodes
 * them and rasterises the lot, and a route that redid that per request is a
 * cheap way for anyone to spend this deployment's compute. A report is written
 * once, and the job that writes one revalidates its tag — so `'max'` under that
 * tag is never served for a report that has since changed.
 *
 * The data directory is an argument rather than read here: resolving it calls
 * `connection()`, which a cached scope refuses.
 */
export async function comparisonCardBytes(
  dataDir: string,
  reportId: string,
  key: string,
): Promise<Uint8Array<ArrayBuffer> | null> {
  'use cache';
  cacheLife('max');
  cacheTag(reportTag(reportId));

  const comparison = await readComparison(dataDir, reportId, key);
  if (!comparison) return null;

  const { variant } = comparison;

  const response = await comparisonCardResponse({
    title: comparisonCopy(reportId, variant).title,
    reportId,
    host: SITE_URL.host,
    panels: await readPanels(dataDir, reportId, variant),
  });

  return new Uint8Array(await response.arrayBuffer());
}

/** What the site card draws: the words the console's own head says. */
export interface SiteCardCopy {
  title: string;
  meta: string;
  /** The foot line. In the copy, not the frame, so `cardVersion` moves with it. */
  tagline: string;
}

export const SITE_CARD_COPY: SiteCardCopy = {
  title: APP_NAME,
  meta: APP_DESCRIPTION,
  tagline: APP_TAGLINE,
};

/** Where the site card is served. Every page without a card of its own shares it. */
export const SITE_CARD_PATH = '/og/site.png';

/**
 * A short digest of what a card draws, for the `?v=` on its address.
 *
 * Link previews cache an image by its URL, for days. A card whose words change
 * under an unchanged URL keeps showing the old words wherever the link was
 * already shared; a URL that moves with the copy is fetched afresh.
 */
export function cardVersion(copy: SiteCardCopy): string {
  return createHash('sha256').update(JSON.stringify(copy)).digest('hex').slice(0, 12);
}

function SiteCard({ title, meta, tagline }: SiteCardCopy) {
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
          style={{ display: 'flex', fontSize: 72, lineHeight: 1.15, letterSpacing: -1.5 }}
        >
          {title}
        </div>
        <div style={{ display: 'flex', marginTop: 28, fontSize: 30, color: CARD.muted }}>
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
        <span>{tagline}</span>
        <span style={{ color: CARD.muted }}>{SITE_URL.host}</span>
      </div>
    </div>
  );
}

export async function siteCardResponse(): Promise<ImageResponse> {
  return new ImageResponse(<SiteCard {...SITE_CARD_COPY} />, {
    ...OG_SIZE,
    fonts: await cardFonts(),
  });
}
