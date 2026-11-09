/**
 * The post helpers that read no file: a tag's route, and the site's one date
 * formatter. Apart from `lib/posts.ts` because that module reads `content/` at
 * import, and a screen story renders in a browser, where it cannot.
 */

/**
 * The URL form of a tag. Frontmatter carries display text — `visual regression`,
 * `CI` — and the route carries this; matching goes through it on both sides, so
 * `/tags/CI` and `/tags/ci` are one page rather than two.
 */
export function tagSlug(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Where a tag chip points, given either its slug or the display text a post's
 * frontmatter writes. One page per slug, so this is the only href shape that
 * reaches a prerendered route.
 */
export function tagPath(tag: string): string {
  return `/tags/${tagSlug(tag)}`;
}

export function formatDate(iso: string, locale = 'en-US'): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
