/**
 * The tag this repository puts on a link it sends to one of its own properties.
 *
 * WHAT THIS IS FOR. The five published surfaces link to each other constantly,
 * and until now every one of those readers arrived without a referrer the
 * destination could group by — so they landed in `direct`, the one bucket that
 * cannot be acted on. A reader who goes portfolio → blog has always arrived
 * carrying a tag; one who goes blog → portfolio arrived naked. This closes the
 * other half.
 *
 * ONE PACKAGE AND NOT A `lib/links.ts` PER APP. Three copies of a vocabulary
 * that must never disagree, in a repository whose whole argument is that
 * agreement should be enforced rather than asserted, is the wrong trade at any
 * price. The cost is real and is paid in `RELEASING.md`: this is the eleventh
 * manifest carrying the one version.
 */

/**
 * The one parameter this repository writes.
 *
 * No `utm_medium`, no `utm_campaign`. A second parameter splits one visit across
 * two dashboard rows and answers no question the first left open — and the
 * portfolio's `proxy.ts` filters `utm_source` alone, so a live `utm_campaign`
 * would travel unguarded through a door the closed list does not watch.
 */
export const CAMPAIGN_PARAM = 'utm_source';

/**
 * Every value this repository writes, and the surface each one names.
 *
 * THE VALUE NAMES THE SURFACE A LINK LEFT, never the one it arrives at. A
 * reader who follows the blog's footer to the console arrives there as `blog`.
 * That is the same rule the portfolio's `OUTBOUND_SOURCE` follows in the other
 * direction, and reading it backwards produces a dashboard where every row is
 * the site you are already looking at.
 *
 * The list is closed here and accepted there: `climaa/portafolio` deletes any
 * `utm_source` outside its own `CAMPAIGN_SOURCES`, silently, at the locale
 * redirect. A fifth value is a line here AND a line there, in that order — the
 * reverse looks like it works and does nothing.
 */
export const SOURCES = ['blog', 'manual', 'visual-diff-ui', 'storybook'] as const;

/** One of {@link SOURCES}. */
export type Source = (typeof SOURCES)[number];

/**
 * The same address, tagged as having left `source`.
 *
 * THE REST OF THE QUERY IS COPIED BYTE FOR BYTE, and that is why this does not
 * use `searchParams.set`. Setting a parameter re-serializes every other one, so
 * `?path=/docs/docs-welcome--docs` comes back as `?path=%2Fdocs%2F…`. Both
 * spellings mean the same thing to a parser, and neither is the one that was
 * written down: `apps/storybook/__tests__/docs-links.test.ts` matches on a
 * literal `?path=/docs/`, and `apps/visual-diff-ui/lib/report-view.ts` documents
 * a colon in `globals=colorScheme:dark` that renders every dark link light once
 * it is escaped. A helper that quietly rewrites the half of the address it was
 * not asked about is a helper that breaks one of those eventually.
 *
 * So the tag is appended — with `&` when a query is already there, `?` when it
 * is not — and an existing tag is dropped first, so a stale source is replaced
 * rather than accumulated. Two sources on one address is two dashboard rows for
 * one reader and neither of them is right.
 *
 * APPLIED AT THE CALL SITE, never baked into a stored address. `CONSOLE_URL`,
 * `PUBLISHED_STORYBOOK` and the tour's `step.path` are what an address IS;
 * tests read those values and assert their shape, and a tag inside the data is
 * a query string every one of those assertions has to learn to ignore.
 *
 * WHOSE JOB THE HOST IS. This does not check that `url` is an own property,
 * because it cannot: the list of own properties is spread across four apps and
 * changes without this file. The caller decides what deserves a tag — a tag on
 * `github.com` travels for nothing, since GitHub shows its owner no
 * `utm_source`, and is visible in the address bar of every reader who follows
 * it. The same is true today of `storybook.carloslima.dev`, whose beacon drops
 * every parameter but `path` before reporting.
 *
 * @throws {TypeError} if `url` is not absolute — `new URL` does the refusing,
 *   and a relative href was never a referral in the first place.
 */
export function tagOutbound(url: string, source: Source): string {
  new URL(url);

  const hashAt = url.indexOf('#');
  const address = hashAt === -1 ? url : url.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : url.slice(hashAt);

  const queryAt = address.indexOf('?');
  const base = queryAt === -1 ? address : address.slice(0, queryAt);
  const query = queryAt === -1 ? '' : address.slice(queryAt + 1);

  const kept = query
    .split('&')
    .filter((pair) => pair !== '' && pair.split('=')[0] !== CAMPAIGN_PARAM)
    .join('&');
  const tag = `${CAMPAIGN_PARAM}=${source}`;

  return `${base}?${kept === '' ? tag : `${kept}&${tag}`}${hash}`;
}
