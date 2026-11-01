import { tagOutbound } from '@gate/links';

/**
 * The console's own copy, in one place: the shell writes it, the tests assert
 * it, and later issues reuse the sample wording where a control has to explain
 * why it is disabled.
 */

export const APP_NAME = 'visual-diff console';

/**
 * The repository this console belongs to, as its root `package.json` names it.
 *
 * Every child project ships this same console, so with two of them open the
 * wordmark alone cannot say which is which. Inlined at build from the manifest
 * (scripts/project-name.mjs), so a child's copy names the child without an
 * edit. Empty only in a build that skipped the inlining, which the suite pins.
 */
export const PROJECT_NAME = process.env.VISUAL_DIFF_PROJECT ?? '';

/** What the browser tab calls the console: what it is, then whose it is. */
export const SITE_TITLE = `${APP_NAME} · ${PROJECT_NAME}`;

/**
 * The deployed origin — `metadataBase`, so a comparison's `og:url` and card are
 * absolute. A link preview fetches both from wherever the link was pasted, so a
 * relative card is a card no unfurler can load.
 *
 * Production, even on a local console: only the deployment is reachable from
 * outside, and its committed sample reports are the only ones a shared link can
 * name. A local report's card would point at a host that does not hold it —
 * which is the truth about sharing a local report.
 */
export const SITE_URL = new URL('https://visual-diff-ui.carloslima.dev');

/** The board's brand line — what this app is, and what it deliberately is not. */
export const APP_TAGLINE = 'the CLI is the engine — this page just drives it';

export const APP_DESCRIPTION =
  'Review visual-diff comparisons: capture sets, reports, and the shots behind every verdict.';

/**
 * How a page's `<title>` reads. The layout hands it to Next, and `lib/share.ts`
 * applies it by hand for the preview headline — one spelling, so a page's tab
 * and its link preview cannot drift apart.
 */
export const TITLE_TEMPLATE = `%s · ${SITE_TITLE}`;

/**
 * The Open Graph fields every page shares. Spread first by the layout and by
 * `lib/share.ts`, because Next merges metadata shallowly: a page that sets
 * `openGraph` replaces the layout's object whole, and would otherwise go out
 * without `og:site_name` or `og:locale`.
 */
export const SITE_OPEN_GRAPH = {
  siteName: APP_NAME,
  locale: 'en_US',
  type: 'website',
} as const;

/** The sample notice's accessible name and its visible text — one string, so the
 *  two can never drift apart. */
/**
 * The manual, linked from the header.
 *
 * An absolute URL because it is a different deployment: the manual is its own
 * Vercel project, so this cannot be a route. The sample-mode console is the
 * manual's referrer by design — a reader judging the mechanism arrives at the
 * console first and needs the way across. Storybook deliberately does not link
 * it: that is developer documentation, and the manual is for end users.
 */
export const MANUAL_NAV = [
  {
    label: 'Manual',
    href: tagOutbound('https://manual.carloslima.dev', 'visual-diff-ui'),
  },
];

export const SAMPLE_LABEL = 'sample data';

export const SAMPLE_NOTE =
  'a committed sample run — this instance has captured nothing of its own';

/** The 404 page's heading and its `<title>`, and what it says under it. A
 *  reviewer arrives here from a link the console itself drew — a report deleted
 *  since the page was rendered is the ordinary way in — so the copy names that
 *  cause rather than blaming the address. Only a report: it is the one thing in
 *  this app with a URL, so it is the only thing a reader can arrive here
 *  looking for. */
export const NOT_FOUND_TITLE = 'Not found';

export const NOT_FOUND_NOTE =
  'Nothing here — a report deleted since this link was drawn reads exactly like an address that never existed.';

/** The way back, on a page whose whole point is that the reader took a wrong
 *  turn. The shell's wordmark is not a link, so without this there is none. */
export const NOT_FOUND_ACTION = 'Back to the console';

/**
 * What `app/error.tsx` and `app/global-error.tsx` say when a render throws.
 *
 * The console reaches this more readily than most apps do, and on purpose:
 * `lib/data.ts` throws rather than returning null when a summary it was asked
 * for is malformed, so schema drift in a written report surfaces as a failure
 * instead of as an empty screen. This is where that lands.
 *
 * Distinct from the 404's copy because the two answer different questions. A
 * miss says the report is gone; this says the report may well be there and the
 * console could not read it — which is why the way on is the same page again
 * rather than a link back to the index.
 *
 * NO `role="alert"` on the element that carries this. apps/e2e/pages/console.ts
 * matches every console refusal with a strict
 * `getByRole('main').getByRole('alert')`, and a second alert inside `main`
 * fails that locator on every scenario that uses it.
 */
export const ERROR_TITLE = 'Something went wrong';

export const ERROR_NOTE =
  'This view could not be rendered. A report the console failed to read reads the same from here as one that was never written.';

export const ERROR_ACTION = 'Try again';
