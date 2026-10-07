import { Link } from '../../atoms/Link/Link';
import { Stack } from '../../atoms/Stack/Stack';

export interface SiteFooterLink {
  label: string;
  href: string;
}

export interface SiteFooterProps {
  /** The rights holder and any trailing copy, e.g. "Carlos Lima — built by its own agent pipeline". */
  copyright: string;
  /**
   * The year printed ahead of `copyright`. A prop, not `new Date().getFullYear()`:
   * computing it inside the component makes the rendered output depend on when it
   * runs, which is the class of drift a visual-diff baseline cannot tell apart
   * from a real regression. The caller (a page, Storybook, the differ) pins it.
   */
  year: number;
  links: SiteFooterLink[];
  /**
   * The release this build was cut from, bare semver (`1.5.0`); printed as `v1.5.0`
   * at the end of the copyright line. A prop for the same reason `year` is: the
   * caller reads it from its own manifest, and a story pins it, so a release bump
   * never moves a baseline.
   */
  version?: string;
  /** Where the version leads, if anywhere: the release notes that name it. */
  versionHref?: string;
  className?: string;
}

/**
 * The version mark: selectable text, never an image, so a bug report can quote it.
 * Last on the line, so it never takes a tab stop ahead of the footer's own links.
 */
function FooterVersion({ version, href }: { version: string; href?: string }) {
  const label = `v${version}`;

  if (!href) return <span className="ds-site-footer__version">{label}</span>;

  return (
    <Link href={href} tone="muted" className="ds-site-footer__version">
      {label}
    </Link>
  );
}

/** Site-wide organism: the copyright line and outbound links rendered in `<footer>`. */
export function SiteFooter({
  copyright,
  year,
  links,
  version,
  versionHref,
  className,
}: SiteFooterProps) {
  return (
    <footer className={['ds-site-footer', className].filter(Boolean).join(' ')}>
      <span>
        © {year} {copyright}
        {version && (
          <>
            {' · '}
            <FooterVersion version={version} href={versionHref} />
          </>
        )}
      </span>
      <Stack as="nav" direction="row" gap={4}>
        {links.map((link) => (
          <Link key={link.href} href={link.href} tone="muted">
            {link.label}
          </Link>
        ))}
      </Stack>
    </footer>
  );
}
