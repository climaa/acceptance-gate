import type { Metadata } from 'next';
import { cacheLife } from 'next/cache';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { Badge, Prose, Stack } from '@gate/ui';
import { RELEASES_PAGE_URL } from '@/lib/github';
import { changelogMdxOptions, mdxComponents } from '@/lib/mdx';
import { getReleases, releaseDate, type Release } from '@/lib/releases';
import {
  CHANGELOG_DESCRIPTION,
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
              children, and a full-width version chip reads as a banner. */}
          <Stack direction="row" gap={3} align="center" wrap>
            <Badge tone="accent">{release.tag}</Badge>
            <time dateTime={release.date}>{releaseDate(release)}</time>
          </Stack>
          <h2>{release.title}</h2>
        </Stack>

        <Prose>
          <ReleaseBody source={release.body} />
        </Prose>

        <p>
          <a href={release.url}>Release notes for {release.tag} on GitHub</a>
        </p>
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

export default async function ChangelogPage() {
  const releases = await getReleases();

  return (
    <Stack gap={8}>
      <h1 className="page-title">{CHANGELOG_TITLE}</h1>

      {releases === null ? (
        <Unavailable />
      ) : (
        <Stack gap={10}>
          {releases.map((release) => (
            <ReleaseEntry key={release.tag} release={release} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
