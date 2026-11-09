import NextLink from 'next/link';
import type { ReactNode } from 'react';
import { SiteFooter, SiteHeader } from '@gate/ui';
import {
  FOOTER_LINKS,
  SITE_COPYRIGHT,
  SITE_COPYRIGHT_YEAR,
  SITE_TITLE,
} from '@/lib/site';
import { SITE_VERSION } from '@/lib/version';

/**
 * What every page sits in: the header, the page's landmark, the footer. Drawn by
 * the root layout, and by each screen story, so a screen is photographed in the
 * frame a visitor sees rather than bare.
 */
export function ManualFrame({ children }: { children: ReactNode }) {
  return (
    <>
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
        version={SITE_VERSION}
        links={FOOTER_LINKS}
      />
    </>
  );
}
