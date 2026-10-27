import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ConsoleFrame, SampleBanner } from '@/components/ConsoleChrome';
import { resolveDataDir } from '@/lib/data';
import {
  APP_DESCRIPTION,
  APP_NAME,
  SITE_OPEN_GRAPH,
  SITE_URL,
  TITLE_TEMPLATE,
} from '@/lib/site';
import { SITE_SHARE_IMAGES } from '@/lib/share';
import { THEME_SCRIPT } from '@/lib/theme';
// Imported for the URL, not the bytes: the bundler emits the same hashed asset
// the design system's `@font-face` already points at, so the preload and the
// stylesheet ask for one file rather than two.
import bodyFace from '@gate/ui/fonts/atkinson-hyperlegible-latin-400-normal.woff2';
import bodyBoldFace from '@gate/ui/fonts/atkinson-hyperlegible-latin-700-normal.woff2';
import displayFace from '@gate/ui/fonts/fraunces-latin-600-normal.woff2';
import monoFace from '@gate/ui/fonts/jetbrains-mono-latin-400-normal.woff2';
import { SiteAnalytics } from './site-analytics';
import './globals.css';

/** What a page that names no preview of its own — the 404 — still shares: the
 *  site fields and the site card. Every page with an address names its own
 *  through `lib/share.ts`, which spreads the same `SITE_OPEN_GRAPH`. */
export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: TITLE_TEMPLATE,
  },
  description: APP_DESCRIPTION,
  metadataBase: SITE_URL,
  openGraph: { ...SITE_OPEN_GRAPH, images: SITE_SHARE_IMAGES },
  twitter: { card: 'summary_large_image', images: SITE_SHARE_IMAGES },
};

/**
 * The faces above the fold on every route: the wordmark (display), the nav and
 * notes (regular), the badges and table heads (bold) — and, unlike the blog,
 * JetBrains Mono, because the console's first screen is panel labels, shas and
 * counts set in it.
 *
 * Preloaded because `fonts.css` sets `font-display: block` for capture
 * determinism: text stays invisible until its face arrives, and without this the
 * browser only discovers a face after the stylesheet parses.
 */
const ABOVE_THE_FOLD_FACES = [bodyFace, bodyBoldFace, displayFace, monoFace];

/**
 * The sample banner, on an instance serving `fixtures/`.
 *
 * Async, and behind its own `<Suspense>`, because `resolveDataDir()` is a
 * request-time answer: rendered inline it would resolve during prerendering,
 * and `next build` runs with no data directory configured — so a deployment
 * with real data would serve a static shell claiming to be sample data, and
 * every e2e world booted off one build would inherit it.
 */
async function SampleNotice() {
  const { isSample } = await resolveDataDir();

  return isSample ? <SampleBanner /> : null;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The script below sets `data-theme` on this element before React sees the
    // document, so the server's markup and the hydrated DOM disagree by design.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* React hoists the stylesheet link ahead of everything a layout
            renders, so this cannot be written above it. It still resolves the
            theme before the first paint: the parser reaches it while still in
            <head>, and the paint it would otherwise flash through is waiting on
            that same stylesheet. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* Written into <head> as links, not through react-dom's `preload()`:
            from a server layout that call reaches the page only as a Flight hint
            at the end of <body>, which the browser acts on after it has already
            found the faces in the stylesheet — the served HTML carried no
            preload at all. `crossOrigin` is not optional even same-origin: fonts
            are fetched in CORS mode, and a preload without it lands in a
            different cache partition, so the face downloads twice. */}
        {ABOVE_THE_FOLD_FACES.map((face) => (
          <link
            key={face}
            rel="preload"
            href={face}
            as="font"
            type="font/woff2"
            crossOrigin="anonymous"
          />
        ))}
      </head>
      <body>
        <ConsoleFrame
          notice={
            <Suspense fallback={null}>
              <SampleNotice />
            </Suspense>
          }
        >
          {children}
        </ConsoleFrame>

        {/* Production deployments only. The package's own detection keys off
            NODE_ENV, which reads "production" on every preview build too — so
            without this, each login-protected preview would report the reviewer
            clicking through it into the same dataset as the live console.

            Same gate apps/blog uses, and the reasoning it rests on is measured
            once for both in Docs/DevOps/Web Analytics rather than restated
            here. The short of it: what the gate withholds is the component, not
            a <script> — no build's HTML carries the beacon's tag, because the
            package appends it in an effect. Read the network log, not the
            markup, when checking whether this works. */}
        {process.env.VERCEL_ENV === 'production' && <SiteAnalytics />}
      </body>
    </html>
  );
}
