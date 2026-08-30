import type { Metadata } from 'next';
import NextLink from 'next/link';
import { preload } from 'react-dom';
import { SiteFooter, SiteHeader } from '@gate/ui';
// Imported for the URL, not the bytes: the bundler emits the same hashed asset
// the design system's `@font-face` already points at, so the preload and the
// stylesheet ask for one file rather than two.
import bodyFace from '@gate/ui/fonts/atkinson-hyperlegible-latin-400-normal.woff2';
import bodyBoldFace from '@gate/ui/fonts/atkinson-hyperlegible-latin-700-normal.woff2';
import displayFace from '@gate/ui/fonts/fraunces-latin-600-normal.woff2';
import { Analytics } from '@vercel/analytics/next';
import {
  FOOTER_LINKS,
  SITE_COPYRIGHT,
  SITE_COPYRIGHT_YEAR,
  SITE_DESCRIPTION,
  SITE_TAGLINE,
  SITE_TITLE,
  SITE_URL,
} from '@/lib/site';
import { THEME_SCRIPT } from '@/lib/theme';
import './globals.css';

/**
 * The faces above the fold on every route: the header's brand and nav, and each
 * page's first heading. JetBrains Mono is left out — nothing here renders a code
 * slab, because the whole argument for this manual's step lists is that they are
 * prose rather than code.
 *
 * They are worth preloading because `fonts.css` sets `font-display: block` for
 * capture determinism, which its own comment prices at "up to ~3 s of invisible
 * text on a slow cold visit". This app is three pages of almost nothing but
 * text, so it pays that cost more than anything else in the repo — and without
 * this the browser only discovers a face after the stylesheet parses.
 */
const ABOVE_THE_FOLD_FACES = [bodyFace, bodyBoldFace, displayFace];

// `crossorigin` is not optional even same-origin: fonts are fetched in CORS mode
// whatever the origin, and a preload without it lands in a different cache
// partition than the stylesheet's request — so the face downloads twice.
const FONT_PRELOAD = {
  as: 'font',
  type: 'font/woff2',
  crossOrigin: 'anonymous',
} as const;

export const metadata: Metadata = {
  // Every absolute URL in the metadata below resolves against this, so it has to
  // name a host that answers — see `lib/site.ts`.
  metadataBase: SITE_URL,
  title: {
    default: `${SITE_TITLE} — ${SITE_TAGLINE}`,
    template: `%s · ${SITE_TITLE}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: SITE_TITLE,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // React hoists these ahead of the stylesheet link it injects, which is the
  // whole point: discovery has to beat the CSS the faces are declared in.
  for (const face of ABOVE_THE_FOLD_FACES) preload(face, FONT_PRELOAD);

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
      </head>
      <body>
        {/* No `nav`: three pages are listed as cards on the index, which is the
            whole navigation this manual has. A header nav would be a second copy
            of it to keep in step. `as={NextLink}` once, forwarded to the brand —
            the design system depends on no framework, so this is where the app
            names its router link. */}
        <SiteHeader brand={SITE_TITLE} as={NextLink} />

        {/* The id is SkipLink's default target, and the landmark the header's
            first tab stop jumps to. */}
        <main id="main" className="ds-container">
          {children}
        </main>

        {/* The organism is the row, not the bar: it caps nothing, so the
            container that lines its content up with the header's is the app's
            to supply. */}
        <SiteFooter
          className="ds-container"
          copyright={SITE_COPYRIGHT}
          year={SITE_COPYRIGHT_YEAR}
          links={FOOTER_LINKS}
        />

        {/* Production deployments only. The package's own detection keys off
            NODE_ENV, which reads "production" on every preview build too — so
            without this, each login-protected preview would report the reviewer
            clicking through it into the same dataset as the live manual.

            Same gate apps/blog and apps/visual-diff-ui use, and the reasoning it
            rests on is measured once for all three in Docs/DevOps/Web Analytics
            rather than restated here. The short of it: what the gate withholds
            is the component, not a <script> — no build's HTML carries the
            beacon's tag, because the package appends it in an effect. Read the
            network log, not the markup, when checking whether this works. */}
        {process.env.VERCEL_ENV === 'production' && <Analytics />}
      </body>
    </html>
  );
}
