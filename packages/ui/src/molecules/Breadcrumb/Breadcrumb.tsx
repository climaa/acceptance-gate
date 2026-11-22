export interface BreadcrumbItem {
  label: string;
  /** Ignored on the last crumb, which is the page the reader is on. */
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

/** Where the reader is, as a path of links back up. */
export function Breadcrumb({ items, className }: BreadcrumbProps) {
  if (items.length === 0) return null;

  const last = items.length - 1;

  return (
    <nav
      aria-label="Breadcrumb"
      className={['ds-breadcrumb', className].filter(Boolean).join(' ')}
    >
      <ol className="ds-breadcrumb__list">
        {items.map((item, index) => (
          // Keyed by position: a path may pass through two crumbs with one label.
          <li key={index} className="ds-breadcrumb__item">
            {index > 0 && (
              <span className="ds-breadcrumb__separator" aria-hidden="true">
                /
              </span>
            )}
            {index === last || item.href === undefined ? (
              <span
                className="ds-breadcrumb__current"
                aria-current={index === last ? 'page' : undefined}
              >
                {item.label}
              </span>
            ) : (
              <a className="ds-breadcrumb__link" href={item.href}>
                {item.label}
              </a>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
