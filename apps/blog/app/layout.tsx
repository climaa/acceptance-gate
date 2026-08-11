import type { Metadata } from 'next';
import NextLink from 'next/link';
import { preload } from 'react-dom';
import { SiteFooter, SiteHeader } from '@gate/ui';
import {
  SITE_COPYRIGHT,
  SITE_COPYRIGHT_YEAR,
  SITE_DESCRIPTION,
  SITE_TAGLINE,
  SITE_TITLE,
  SITE_URL,
} from '@/lib/site';
import { THEME_SCRIPT } from '@/lib/theme';
// Imported for the URL, not the bytes: the bundler emits the same hashed asset
// the design system's `@font-face` already points at, so the preload and the
// stylesheet ask for one file rather than two.
import bodyFace from '@gate/ui/fonts/atkinson-hyperlegible-latin-400-normal.woff2';
import bodyBoldFace from '@gate/ui/fonts/atkinson-hyperlegible-latin-700-normal.woff2';
import displayFace from '@gate/ui/fonts/fraunces-latin-600-normal.woff2';
import './globals.css';

/**
 * The faces above the fold on every route: the header's nav (regular) and brand
 * (bold), and the page's first heading (the display face). JetBrains Mono is
 * left out — a code slab is far below the fold, and bandwidth spent on it is
 * bandwidth taken from a face the reader is already waiting on.
 *
 * They are worth preloading because `fonts.css` sets `font-display: block` for
 * capture determinism: text stays invisible until its face arrives, and without
 * this the browser only discovers the face after the stylesheet parses.
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

const NAV = [
  { label: 'Blog', href: '/blog' },
  { label: 'About', href: '/about' },
];

const FOOTER_LINKS = [
  { label: 'RSS', href: '/rss.xml' },
  { label: 'GitHub', href: 'https://github.com/climaa' },
  { label: 'Storybook', href: 'https://acceptance-gate-storybook.vercel.app' },
];

export const metadata: Metadata = {
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
  alternates: {
    types: {
      'application/rss+xml': '/rss.xml',
    },
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
        {/* `as={NextLink}` once, forwarded to the brand and to every nav item:
            the design system depends on no framework, so this is where the app
            names its router link. */}
        <SiteHeader brand={SITE_TITLE} nav={NAV} as={NextLink} />

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
      </body>
    </html>
  );
}
