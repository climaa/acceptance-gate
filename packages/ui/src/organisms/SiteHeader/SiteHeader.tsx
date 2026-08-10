import type { ElementType, ReactNode } from 'react';

import { Link, SkipLink, ThemeToggle } from '../../atoms';

export interface SiteNavItem {
  label: string;
  href: string;
}

export interface SiteHeaderProps {
  /**
   * The brand's content — a wordmark, a logo node. It is a slot for content, not
   * for a link of the caller's own: the header wraps it in a `Link` so `as` below
   * is the single place an app names its router link.
   */
  brand: ReactNode;
  /** Where the brand points. Defaults to the site root. */
  brandHref?: string;
  nav?: SiteNavItem[];
  /**
   * The element or component every link in the header renders as, forwarded to
   * `Link`. An app names its router link once here — `as={NextLink}` — rather
   * than per item, and this package still depends on no framework.
   *
   * Not generic the way `Link` is: this organism passes a fixed set of props to
   * the elements it builds, so there is nothing for the caller's element type to
   * widen.
   */
  as?: ElementType;
  /** Id (without the leading `#`) the skip link jumps to. Defaults to `main`. */
  skipTargetId?: string;
  className?: string;
}

/**
 * The page's top bar: brand on the left, nav and the theme switch on the right.
 *
 * `SkipLink` comes first inside the landmark because the header is the first
 * thing on the page — that ordering is what makes it the first tab stop, which
 * is the whole reason the atom exists.
 */
export function SiteHeader({
  brand,
  brandHref = '/',
  nav = [],
  as,
  skipTargetId,
  className,
}: SiteHeaderProps) {
  return (
    <header className={['ds-site-header', className].filter(Boolean).join(' ')}>
      <SkipLink targetId={skipTargetId} />

      <div className="ds-container ds-site-header__inner">
        <Link as={as} href={brandHref} className="ds-site-header__brand">
          {brand}
        </Link>

        <div className="ds-site-header__end">
          {/* An empty nav renders no landmark at all: a `<nav>` with nothing in
              it is still announced and still navigable to. */}
          {nav.length > 0 && (
            <nav className="ds-site-header__nav">
              {/* Muted, the quieter of the two tones: the nav sits beside the
                  brand and should not compete with it for the reader's eye. */}
              {nav.map((item) => (
                <Link key={item.href} as={as} href={item.href} tone="muted">
                  {item.label}
                </Link>
              ))}
            </nav>
          )}

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
