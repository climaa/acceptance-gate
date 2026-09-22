import { tagOutbound } from '@gate/links';

/**
 * Single source for the deployed origin. `app/layout.tsx` needs it for
 * `metadataBase` and `app/sitemap.ts` to build absolute URLs — this is the one
 * place the host is written literally.
 *
 * Aim it at somewhere real, always: a `metadataBase` pointing at a host that
 * does not resolve breaks every absolute URL built on it. This one was earned
 * rather than assumed. Vercel assigns a project's `.vercel.app` name once, at
 * creation, and never regenerates it on rename — the project was created as
 * `manual`, `manual.vercel.app` was already someone else's, so it was minted
 * `manual-seven-kappa.vercel.app` and kept that through the rename. The tidy
 * `.vercel.app` name had to be added to the project and aliased before it
 * served anything; the custom domain below went through the same step, and the
 * `.vercel.app` names now 307 to it. Verified against the live origin, not
 * inferred from the project name.
 */
export const SITE_URL = new URL('https://manual.carloslima.dev');

export function absoluteUrl(pathname: string): string {
  return new URL(pathname, SITE_URL).toString();
}

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
  'Nothing at this address. This manual is a short one, and the index lists every page it has.';

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
 * The deployed console, written once.
 *
 * Three places need it now and they must not drift: a footer pointing at a live
 * instance while the in-body call to action points at a dead one is the kind of
 * break nobody notices, because the reader who follows the broken one never
 * comes back to report it.
 *
 * THIS ONE IS BARE, and {@link CONSOLE_LINK} is the tagged spelling. The
 * difference is what the address is for. `lib/tour.ts` resolves its steps
 * against this constant, and a tour step is a console ADDRESS — it spells a
 * position, `?story=`, `?mode=slider`, `?bucket=changed`, and
 * `__tests__/tour.test.ts` enforces that it carries no parameter the console
 * does not read. `utm_source` is read by the beacon, not the console, so it
 * belongs on the two links a reader follows as a referral and on neither of the
 * five the tour resolves.
 */
export const CONSOLE_URL = 'https://visual-diff-ui.carloslima.dev';

/** The console as a referral: the footer and the index's Start-here block, which
 *  are the two links a reader follows to leave this manual for it. */
export const CONSOLE_LINK = tagOutbound(CONSOLE_URL, 'manual');

/**
 * The deployed console is the thing this manual describes, so it leads. It runs
 * in sample mode, which is why one of the three pages is about that.
 *
 * Storybook and GitHub stay bare: GitHub shows its owner no `utm_source`, and
 * Storybook's beacon drops every parameter but `path` before recording, so both
 * tags would travel for nothing and show in the reader's address bar.
 */
export const FOOTER_LINKS = [
  { label: 'The console', href: CONSOLE_LINK },
  { label: 'Storybook', href: 'https://storybook.carloslima.dev' },
  { label: 'Blog', href: tagOutbound('https://blog.carloslima.dev', 'manual') },
  { label: 'GitHub', href: 'https://github.com/climaa/acceptance-gate' },
];
