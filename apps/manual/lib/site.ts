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
 * The deployed console is the thing this manual describes, so it leads. It runs
 * in sample mode, which is why one of the three pages is about that.
 */
export const FOOTER_LINKS = [
  { label: 'The console', href: 'https://acceptance-gate-visual-diff-ui.vercel.app' },
  { label: 'Storybook', href: 'https://acceptance-gate-storybook.vercel.app' },
  { label: 'Blog', href: 'https://acceptance-gate-blog.vercel.app' },
  { label: 'GitHub', href: 'https://github.com/climaa/acceptance-gate' },
];
