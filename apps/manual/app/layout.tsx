import type { Metadata } from 'next';
import NextLink from 'next/link';
import { SiteFooter, SiteHeader } from '@gate/ui';
import {
  FOOTER_LINKS,
  SITE_COPYRIGHT,
  SITE_COPYRIGHT_YEAR,
  SITE_DESCRIPTION,
  SITE_TAGLINE,
  SITE_TITLE,
} from '@/lib/site';
import { THEME_SCRIPT } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: `${SITE_TITLE} — ${SITE_TAGLINE}`,
    template: `%s · ${SITE_TITLE}`,
  },
  description: SITE_DESCRIPTION,
};

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
      </body>
    </html>
  );
}
