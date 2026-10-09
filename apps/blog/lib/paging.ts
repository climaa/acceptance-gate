/**
 * How `/blog` is cut into pages.
 *
 * Page 1 is `/blog` itself and every later page is `/blog/page/N`, the addressing
 * Board 01's Pagination tile rules on, so one page has one address and the index
 * keeps the URL it has always had. Pure functions over a count, so the routes,
 * the sitemap and the proxy all derive the same page set from the same number.
 */

export const POSTS_PER_PAGE = 4;

/** At least one: an empty blog is still one page, the one that says it is empty. */
export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / POSTS_PER_PAGE));
}

export function pageOf<T>(items: readonly T[], page: number): T[] {
  const start = (page - 1) * POSTS_PER_PAGE;
  return items.slice(start, start + POSTS_PER_PAGE);
}

export function blogPagePath(page: number): string {
  return page === 1 ? '/blog' : `/blog/page/${page}`;
}

/** The pages with an address of their own — 2 up to the last. Page 1 is `/blog`. */
export function laterPages(total: number): number[] {
  return Array.from({ length: pageCount(total) - 1 }, (_, index) => index + 2);
}

/**
 * Reads a `/blog/page/[n]` param. Only the canonical spelling of a page that
 * exists is a page: `1` has its own address, `02` and `2.0` are not how the
 * sitemap writes 2, and anything past the last page is a miss.
 */
export function parseLaterPage(param: string, total: number): number | null {
  if (!/^[1-9]\d*$/.test(param)) return null;

  const page = Number(param);
  return page >= 2 && page <= pageCount(total) ? page : null;
}
