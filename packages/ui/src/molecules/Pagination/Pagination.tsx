import type { ElementType } from 'react';

import { IconButton } from '../../atoms/IconButton/IconButton';
import { Link } from '../../atoms/Link/Link';
import { Stack } from '../../atoms/Stack/Stack';

export interface PaginationProps {
  /** The page being shown, 1-based. */
  page: number;
  pageCount: number;
  /**
   * Builds the href for a page. Defaults to `/blog` for page 1 and
   * `/blog/page/${n}` after it — the addressing Board 01 rules on — so a caller
   * can render the control without supplying one; the prop exists so this
   * package never hardcodes an app's route shape.
   */
  hrefFor?: (page: number) => string;
  /**
   * Forwarded to every link — the numbers and both arrows — so a caller
   * supplies a router link (e.g. `NextLink`) once rather than per item.
   */
  as?: ElementType;
  /** The landmark's name. One per page, so the default rarely needs changing. */
  label?: string;
  className?: string;
}

/** One entry of the number row: a page, or the ellipsis standing for a run of them. */
export type PaginationItem = number | 'gap';

const defaultHrefFor = (page: number): string =>
  page === 1 ? '/blog' : `/blog/page/${page}`;

/**
 * The window Board 01 draws: the first page, the last, the current one and one
 * neighbour on each side always stay; every run of hidden pages collapses to a
 * single gap. Pure, so the test can pin it without rendering anything.
 */
export function paginationWindow(page: number, pageCount: number): PaginationItem[] {
  const kept = new Set([1, pageCount, page - 1, page, page + 1]);
  const items: PaginationItem[] = [];

  for (let n = 1; n <= pageCount; n += 1) {
    if (kept.has(n)) {
      items.push(n);
    } else if (items[items.length - 1] !== 'gap') {
      items.push('gap');
    }
  }

  return items;
}

const Chevron = ({ direction }: { direction: 'left' | 'right' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={direction === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
  </svg>
);

interface ArrowProps {
  /** The page the arrow leads to, or `undefined` at the end it cannot pass. */
  target: number | undefined;
  label: string;
  direction: 'left' | 'right';
  hrefFor: (page: number) => string;
  as: ElementType | undefined;
}

/**
 * Previous and next are `IconButton`, as the board draws them. At the first and
 * last page the arrow is still rendered — the row keeps its shape — but as a
 * disabled button: muted, out of the tab order, and not a link to nowhere.
 */
function Arrow({ target, label, direction, hrefFor, as }: ArrowProps) {
  if (target === undefined) {
    return (
      <IconButton label={label} size="sm" disabled>
        <Chevron direction={direction} />
      </IconButton>
    );
  }

  return (
    <IconButton as={as ?? 'a'} href={hrefFor(target)} label={label} size="sm">
      <Chevron direction={direction} />
    </IconButton>
  );
}

/**
 * Page navigation for a listing: a `<nav>` landmark around a list of links.
 *
 * Every page but the current one is a `Link`; the current page is text carrying
 * `aria-current="page"`, because a link to the page you are on is a tab stop
 * that goes nowhere. Composed from atoms the way `TagList` is, and like it,
 * `<ul>`/`<li>` rather than a bare row so a screen reader announces the count.
 * With one page there is nothing to navigate, so it renders nothing at all.
 */
export function Pagination({
  page,
  pageCount,
  hrefFor = defaultHrefFor,
  as,
  label = 'Pagination',
  className,
}: PaginationProps) {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <nav
      aria-label={label}
      className={['ds-pagination', className].filter(Boolean).join(' ')}
    >
      <Stack
        as="ul"
        direction="row"
        gap={2}
        align="center"
        className="ds-pagination__list"
      >
        <li>
          <Arrow
            target={page > 1 ? page - 1 : undefined}
            label="Previous page"
            direction="left"
            hrefFor={hrefFor}
            as={as}
          />
        </li>

        {paginationWindow(page, pageCount).map((item, index) =>
          item === 'gap' ? (
            // Keyed by position: two gaps can exist and neither has a number.
            <li key={`gap-${index}`} className="ds-pagination__gap" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={item}>
              {item === page ? (
                <span
                  className="ds-pagination__page ds-pagination__page--current"
                  aria-current="page"
                >
                  {item}
                </span>
              ) : (
                <Link
                  as={as}
                  href={hrefFor(item)}
                  tone="muted"
                  className="ds-pagination__page"
                  aria-label={`Page ${item}`}
                >
                  {item}
                </Link>
              )}
            </li>
          ),
        )}

        <li>
          <Arrow
            target={page < pageCount ? page + 1 : undefined}
            label="Next page"
            direction="right"
            hrefFor={hrefFor}
            as={as}
          />
        </li>
      </Stack>
    </nav>
  );
}
