/**
 * Single source for the deployed origin. `app/layout.tsx` needs it for
 * `metadataBase`, `app/rss.xml/route.ts` and `app/sitemap.ts` need it to build
 * absolute URLs — this is the one place the domain is written literally.
 *
 * The Vercel origin rather than a custom domain, because there is no registered
 * domain yet. That distinction is not cosmetic: a `metadataBase` pointing at a
 * host that does not resolve breaks every absolute URL built on it — the OG
 * image the card fetches, the `<link>` in every RSS item, every sitemap
 * `<loc>`. Aim it at somewhere real, always.
 *
 * `lib/og.tsx` also prints this host on every social card, which is the visible
 * argument for registering a domain. When one exists, this line is the only
 * edit — the feed tests derive their expectations from this constant.
 */
export const SITE_URL = new URL('https://acceptance-gate-blog.vercel.app');

export const SITE_TITLE = 'Carlos Lima';

/** The half of the home page's `<title>` that is not the name, reused by the site OG card. */
export const SITE_TAGLINE = 'Frontend engineering and quality';

/** The rights holder the footer prints after the year. */
export const SITE_COPYRIGHT = 'Carlos Lima · Barcelona';

/**
 * Pinned rather than read off the clock. `new Date().getFullYear()` makes the
 * rendered footer depend on when the build runs, which is drift a visual-diff
 * baseline cannot tell apart from a real regression.
 */
export const SITE_COPYRIGHT_YEAR = 2026;

/**
 * The 404 page's heading and its `<title>`, what it says under that, and the way
 * on. Nobody arrives here on purpose: a slug that changed, an address typed
 * wrong, or a draft's URL passed around before it was ever published. The copy
 * names the situation without accusing the reader of anything, because from out
 * here a post that was never published and one that never existed are the same
 * page. Neither is in `generateStaticParams`, so `proxy.ts` turns both into the
 * same `404` before either reaches a render — the copy is what makes that
 * indistinguishably deliberate rather than a leak.
 *
 * `/blog` rather than `/` as the way on: the header's wordmark is not a link,
 * and the index is what someone chasing an article actually wanted.
 */
export const NOT_FOUND_TITLE = 'Not found';

export const NOT_FOUND_NOTE =
  'Nothing at this address. An article that was never published and one that never existed read the same from out here.';

export const NOT_FOUND_ACTION = 'All articles';

/**
 * What `app/error.tsx` and `app/global-error.tsx` say when a render throws.
 *
 * Separate copy from the 404's, because the two are not the same event and a
 * reader can act on the difference: a miss means the address leads nowhere and
 * the way on is elsewhere on the site, while this means the address was right
 * and this end failed to serve it. So the way on here is the same page again,
 * not a different one — `retry()` re-renders the segment, and for a transient
 * fault that is the whole fix.
 *
 * The copy names no cause. What threw is a server-side detail the reader cannot
 * act on, and in production React redacts the message anyway.
 */
export const ERROR_TITLE = 'Something went wrong';

export const ERROR_NOTE =
  'This page could not be rendered. Nothing is wrong with the address you followed — the fault is on this end.';

export const ERROR_ACTION = 'Try again';

export const SITE_DESCRIPTION =
  'Notes on Next.js, testing with Cypress and Gherkin, visual regression and coding agents.';

/**
 * The changelog's own heading, `<title>` and description.
 *
 * "Changelog" rather than "Releases" because it is the word a reader scanning a
 * nav already knows, and the page is the story of what shipped rather than a
 * list of artifacts to download.
 */
export const CHANGELOG_TITLE = 'Changelog';

export const CHANGELOG_DESCRIPTION =
  'What shipped in acceptance-gate, release by release, in the words the release notes were written in.';

/**
 * What the page says when the build could not establish what the releases are.
 *
 * A note on the page, not an error page: the route is fine, the nav still leads
 * here, and everything else on the site is unaffected — so rendering a failure
 * screen would overstate what went wrong. The copy follows the 404's and the
 * error page's rule of naming no cause, for a sharper reason than theirs. A
 * reader cannot tell a rate limit from an outage from a schema change, and by
 * the time anyone reads this the build that failed is hours old. What they can
 * use is the way on, so the way on is the whole of the second sentence.
 *
 * This string is also the alarm. Nothing reports from a prerender — no reporter
 * is installed and the logger is silent under production — so the only evidence
 * a fetch failed is this note on the deployed page, and
 * `.github/workflows/changelog-check.yml` reads it back on a schedule. Change
 * the wording and that workflow's assertion changes with it, or the alarm stops
 * ringing while the page keeps saying this.
 */
export const CHANGELOG_UNAVAILABLE_NOTE =
  'The release notes could not be loaded when this page was built. They are all on GitHub in the meantime, and this page will catch up on the next build.';

export const CHANGELOG_UNAVAILABLE_ACTION = 'Releases on GitHub';

/**
 * How each entry links to its own release on github.com.
 *
 * A constant rather than a phrase inline in the page, because the scheduled
 * check greps for it to decide the page is showing releases at all. The note
 * above answers "did the fetch fail"; this answers "did anything render" — a
 * page showing neither is broken in a third way, and greping for only the first
 * would call that healthy.
 */
export const CHANGELOG_RELEASE_LINK_PREFIX = 'Release notes for';

export function absoluteUrl(pathname: string): string {
  return new URL(pathname, SITE_URL).toString();
}

/**
 * The comment control's accessible names, and the note that stands beside a
 * failure.
 *
 * The name says what the press will DO, and it changes with what the control is
 * currently able to do — load, wait, arrive, retry. An icon that animates
 * through four states and calls itself one thing throughout would be a control
 * a screen reader reads as inert while a sighted reader watches it work.
 *
 * The tag is in every one of them because the page carries every release at
 * once: "Load the conversation" names four different actions on this page, and
 * only the version tells them apart.
 */
export function commentsLoadLabel(tag: string): string {
  return `Load the conversation for ${tag}`;
}

export function commentsLoadingLabel(tag: string): string {
  return `Loading the conversation for ${tag}`;
}

/** The name once the thread is mounted — a press then MOVES, and says so. */
export function commentsGoToLabel(tag: string): string {
  return `Go to the conversation for ${tag}`;
}

export function commentsRetryLabel(tag: string): string {
  return `Retry loading the conversation for ${tag}`;
}

/**
 * The invitation under the icon.
 *
 * The control is an unlabelled drawing. Its accessible name says what a press
 * does, so assistive tech has always been told; a sighted reader had a document
 * and a pencil and no reason to think either was a button. This is the visible
 * half of that name.
 *
 * It says what is on offer rather than what to do — "react or comment" is the
 * thing a reader might want, where "open the conversation" is the mechanism they
 * would have to already care about. The second sentence is not decoration: the
 * thread is a GitHub discussion and commenting needs an account, and a reader
 * who finds that out only after pressing has been led somewhere under a false
 * impression.
 *
 * "this release" rather than a version, because the control follows whichever
 * release is on screen and the version is already in the button's name.
 */
export const COMMENTS_INVITE =
  'React or comment on this release. The conversation is a GitHub discussion, so commenting needs a GitHub account.';

/**
 * What the page says when a thread could not be loaded.
 *
 * The red ring is not the message. A reader who cannot see the icon, or who has
 * reduced motion on and is looking at a still, gets nothing from a colour — so
 * the failure is written down, in a live region, every time.
 *
 * It names no cause for the reason `CHANGELOG_UNAVAILABLE_NOTE` names none:
 * from out here a blocked third-party frame, an extension, an outage and a
 * network drop are the same event, and the reader can act on none of them. What
 * they can act on is the retry, so the retry is the second sentence.
 *
 * It points nowhere else, deliberately. The obvious closing offer — read it on
 * GitHub — would have to say WHERE, and the two candidates are both wrong: the
 * release entry's own link goes to the release, which is not the discussion,
 * and a link to the discussion cannot be built without the id that only a
 * mounted embed knows. A sentence naming a way out that this control cannot
 * actually open is the same class of lie as a check mark over a thread that
 * never loaded.
 */
export const COMMENTS_FAILED_NOTE =
  'The conversation for this release could not be loaded. Press again to retry — nothing else on this page is affected.';
