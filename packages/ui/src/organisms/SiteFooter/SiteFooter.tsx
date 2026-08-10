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
  className?: string;
}

/** Site-wide organism: the copyright line and outbound links rendered in `<footer>`. */
export function SiteFooter({ copyright, year, links, className }: SiteFooterProps) {
  return (
    <footer className={['ds-site-footer', className].filter(Boolean).join(' ')}>
      <span>
        © {year} {copyright}
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
