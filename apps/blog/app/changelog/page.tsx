import type { Metadata } from 'next';
import { cacheLife } from 'next/cache';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { ChangelogScreen } from '@/components/ChangelogScreen';
import { changelogMdxOptions, mdxComponents } from '@/lib/mdx';
import { getReleases, releaseDate } from '@/lib/releases';
import { pageMetadata } from '@/lib/share';
import { CHANGELOG_DESCRIPTION, CHANGELOG_TITLE } from '@/lib/site';

export const metadata: Metadata = pageMetadata({
  path: '/changelog',
  title: CHANGELOG_TITLE,
  description: CHANGELOG_DESCRIPTION,
});

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

/** Each release with its date formatted and its body compiled, as the screen takes it. */
export default async function ChangelogPage() {
  const releases = await getReleases();

  return (
    <ChangelogScreen
      releases={
        releases?.map((release) => ({
          ...release,
          displayDate: releaseDate(release),
          body: <ReleaseBody source={release.body} />,
        })) ?? null
      }
    />
  );
}
