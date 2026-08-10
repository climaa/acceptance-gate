import type { Metadata } from 'next';
import Link from 'next/link';
import { preload } from 'react-dom';
import { SITE_DESCRIPTION, SITE_TAGLINE, SITE_TITLE, SITE_URL } from '@/lib/site';
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
        <header className="site-header">
          <div className="ds-container site-header__inner">
            <Link href="/" className="site-brand">
              Carles Lima
            </Link>
            <nav className="site-nav">
              <Link href="/blog">Blog</Link>
              <Link href="/about">About</Link>
            </nav>
          </div>
        </header>

        <main className="ds-container">{children}</main>

        <footer className="site-footer">
          <div className="ds-container">
            © {new Date().getFullYear()} Carles Lima · Barcelona
          </div>
        </footer>
      </body>
    </html>
  );
}
