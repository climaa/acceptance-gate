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

const NAV = [
  { label: 'Blog', href: '/blog' },
  { label: 'Changelog', href: '/changelog' },
  { label: 'About', href: '/about' },
];

/**
 * What every page sits in: the header, the page's landmark, the footer. Drawn by
 * the root layout, and by each screen story, so a screen is photographed in the
 * frame a visitor sees rather than bare.
 */
export function BlogFrame({ children }: { children: ReactNode }) {
  return (
    <>
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
        version={SITE_VERSION}
        versionHref="/changelog"
        links={FOOTER_LINKS}
      />
    </>
  );
}
