import type { Metadata } from 'next';
import { cacheLife } from 'next/cache';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { Badge, Prose, Stack } from '@gate/ui';
import { ChangelogSyncButton } from '@/components/ChangelogSyncButton';
import { GISCUS_CONFIGURED } from '@/lib/giscus';
import { RELEASES_PAGE_URL } from '@/lib/github';
import { changelogMdxOptions, mdxComponents } from '@/lib/mdx';
import { getReleases, releaseDate, type Release } from '@/lib/releases';
import {
  CHANGELOG_DESCRIPTION,
  CHANGELOG_RELEASE_LINK_PREFIX,
  CHANGELOG_TITLE,
  CHANGELOG_UNAVAILABLE_ACTION,
  CHANGELOG_UNAVAILABLE_NOTE,
} from '@/lib/site';

export const metadata: Metadata = {
  title: CHANGELOG_TITLE,
  description: CHANGELOG_DESCRIPTION,
};

/**
 * One release body, compiled at build time.
 *
 * A cache boundary for the same reason `PostBody` is one: the highlighter reads
 * the clock, and under Cache Components any clock read during a prerender fails
 * the build. Per release rather than per page, so one long body does not make
 * every other body's cache entry depend on it.
 */
async function ReleaseBody({ source }: { source: string }) {
  'use cache';
  cacheLife('max');

  return (
    <MDXRemote source={source} options={changelogMdxOptions} components={mdxComponents} />
  );
}

/**
 * The version is a badge and the story is the heading.
 *
 * GitHub's release name carries both — `v1.3.0 — the console gets a manual` —
 * and printing it whole beside a separate tag would say the version twice. The
 * split happens in `narrativeTitle`; this is only where the two halves land.
 *
 * The `id` is the tag, so `/changelog#v1.3.0` reaches an entry. That is the
 * cheap half of linking to a release, and it commits the page to no expand
 * control, no version rail, and nothing the design board has yet to decide.
 */
function ReleaseEntry({ release }: { release: Release }) {
  return (
    <article id={release.tag}>
      <Stack gap={3}>
        <Stack gap={2}>
          {/* Row, so the badge sizes to its text: a column stretches its
              children, and a full-width version chip reads as a banner.

              The badge is dropped when the release has no title of its own,
              because the heading below is then the version itself and the two
              would say the same word twice. */}
          <Stack direction="row" gap={3} align="center" wrap>
            {release.title !== null && <Badge tone="accent">{release.tag}</Badge>}
            <time dateTime={release.date}>{releaseDate(release)}</time>
          </Stack>
          <h2>{release.title ?? release.tag}</h2>
        </Stack>

        <Prose>
          <ReleaseBody source={release.body} />
        </Prose>

        <p>
          <a href={release.url}>
            {CHANGELOG_RELEASE_LINK_PREFIX} {release.tag} on GitHub
          </a>
        </p>

        {/* Empty, and stays empty unless a reader asks for this release's
            conversation — `ChangelogSyncButton` injects giscus's loader here on
            the press. Rendered by the page rather than by that component
            because the two live in different places in the tree: the control is
            in the sticky column, the thread belongs under the release it is
            about.

            React never reconciles what goes inside it — there are no children
            here for it to have an opinion about — so the iframe giscus writes
            is not something React will later remove.

            No reserved height. Holding 300px open under all four releases would
            be a permanent hole on every visit, paid against a layout shift that
            does not count: the mount happens within 500ms of the press that
            asked for it, which is the window CLS excludes as user-initiated. */}
        {GISCUS_CONFIGURED && (
          <div className="release-comments" data-release-comments={release.tag} />
        )}
      </Stack>
    </article>
  );
}

/**
 * The fail-open state, and the only thing on the page that is not a release.
 *
 * `role` is deliberately absent. The page rendered, the route works, and a
 * reader who arrived here is not being interrupted — announcing this as an
 * alert would make an ordinary stale build sound like a fault in the page they
 * are on.
 */
function Unavailable() {
  return (
    <Prose>
      <p>{CHANGELOG_UNAVAILABLE_NOTE}</p>
      <p>
        <a href={RELEASES_PAGE_URL}>{CHANGELOG_UNAVAILABLE_ACTION}</a>
      </p>
    </Prose>
  );
}

/**
 * The page: its title, the releases, and the control that opens their
 * conversations beside them.
 *
 * All three are children of one grid rather than the title sitting above it,
 * and that is what lets the control start level with the heading instead of
 * below the first release's date. The alternative — pulling the aside up with a
 * negative margin — sets the icon's position from the rendered height of a
 * display heading, which is a number no stylesheet should be asked to know.
 *
 * Each child is placed by row explicitly, because the two layouts disagree
 * about where the control goes and only one of them matches source order. Beside
 * the text it spans both rows so it can start at the top of the first; stacked,
 * it sits between the title and the releases — a control that is about the
 * release you are reading belongs above them, and the title still comes first.
 *
 * The control is rendered only when giscus has both of its ids — without them
 * an embed builds an iframe that fails inside itself, and the icon would be
 * animating a load that cannot finish. A page with no comment control is a
 * page; a page with a control that always ends red is a defect. It is skipped
 * for the fail-open state too: there is nothing to comment on, and offering to
 * load the conversation for a release the page is not showing would be asking
 * about something the reader cannot see.
 */
export default async function ChangelogPage() {
  const releases = await getReleases();
  const showComments = GISCUS_CONFIGURED && releases !== null && releases.length > 0;

  return (
    <div className="changelog-layout">
      <h1 className="page-title changelog-layout__title">{CHANGELOG_TITLE}</h1>

      {showComments && (
        <aside className="changelog-layout__aside">
          <ChangelogSyncButton releases={releases.map(({ tag }) => ({ tag }))} />
        </aside>
      )}

      <div className="changelog-layout__main">
        {releases === null ? (
          <Unavailable />
        ) : (
          <Stack gap={10}>
            {releases.map((release) => (
              <ReleaseEntry key={release.tag} release={release} />
            ))}
          </Stack>
        )}
      </div>
    </div>
  );
}
