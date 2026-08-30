export const SITE_TITLE = 'Visual-diff manual';

export const SITE_TAGLINE = 'What the console does, taken from what it must do';

export const SITE_DESCRIPTION =
  'The end-user manual for the visual-diff console, with every page built from the acceptance scenarios that block the merge.';

/** The rights holder the footer prints after the year. */
export const SITE_COPYRIGHT = 'Carlos Lima · Barcelona';

/**
 * Pinned rather than read off the clock, matching `apps/blog`. A footer that
 * depends on when the build ran is drift a reader cannot see and a diff cannot
 * explain.
 */
export const SITE_COPYRIGHT_YEAR = 2026;

/**
 * The 404 page's heading, what it says under that, and the way on. Nobody
 * arrives here on purpose: an address typed wrong, or a link to a page this
 * manual has not grown yet. The copy names the situation without pretending the
 * site is larger than it is — three pages, all of them on the index.
 */
export const NOT_FOUND_TITLE = 'Not found';

export const NOT_FOUND_NOTE =
  'Nothing at this address. This manual is three pages long, and the index lists every one of them.';

export const NOT_FOUND_ACTION = 'All pages';

/**
 * What `app/error.tsx` and `app/global-error.tsx` say when a render throws.
 *
 * Separate copy from the 404's, because a reader can act on the difference: a
 * miss means the address leads nowhere and the way on is elsewhere; this means
 * the address was right and this end failed to serve it. So the way on here is
 * the same page again — for a transient fault that is the whole fix.
 *
 * The copy names no cause. What threw is a server-side detail the reader cannot
 * act on, and in production React redacts the message anyway.
 */
export const ERROR_TITLE = 'Something went wrong';

export const ERROR_NOTE =
  'This page could not be rendered. Nothing is wrong with the address you followed — the fault is on this end.';

export const ERROR_ACTION = 'Try again';

/**
 * The deployed console is the thing this manual describes, so it leads. It runs
 * in sample mode, which is why one of the three pages is about that.
 */
export const FOOTER_LINKS = [
  { label: 'The console', href: 'https://acceptance-gate-visual-diff-ui.vercel.app' },
  { label: 'Storybook', href: 'https://acceptance-gate-storybook.vercel.app' },
  { label: 'Blog', href: 'https://acceptance-gate-blog.vercel.app' },
  { label: 'GitHub', href: 'https://github.com/climaa/acceptance-gate' },
];
