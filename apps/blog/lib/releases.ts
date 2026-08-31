import { cacheLife } from 'next/cache';
import { z } from 'zod';
import { RELEASES_FIXTURE } from '../fixtures/releases';
import { RELEASES_API_URL } from './github';
import { formatDate } from './posts';

/**
 * The GitHub releases, fetched once at build time and never at request time.
 *
 * The page is a build artifact by decision, not by accident: the only thing
 * that puts a new release on the site is a new build, so a failed fetch cannot
 * half-populate the page and a successful one cannot drift. What it can do is
 * fail — see `getReleases`, which is the whole of the fail-open policy.
 */

/**
 * Only the fields the page renders, and `draft`/`prerelease` because they decide
 * whether it renders at all. Every other field GitHub sends is ignored rather
 * than described: this schema's job is to refuse a response that cannot be
 * rendered, not to model the API.
 *
 * `name`, `body` and `published_at` are nullable in the API and are treated as
 * such here — a release published with no body is unusual, not malformed.
 */
const RawReleaseSchema = z.object({
  tag_name: z.string().min(1),
  name: z.string().nullable(),
  html_url: z.string().min(1),
  published_at: z.string().nullable(),
  body: z.string().nullable(),
  draft: z.boolean(),
  prerelease: z.boolean(),
});

const ReleasesSchema = z.array(RawReleaseSchema);

/**
 * A release as GitHub sends it — inferred from the schema rather than written
 * out beside it, so the fixture cannot describe a release this would reject.
 *
 * That was a real gap, not a tidy-up: the fixture is what every CI build and
 * every test runs on, so a hand-written twin that drifted looser than the schema
 * would have CI passing on shapes production refuses.
 */
export type RawRelease = z.infer<typeof RawReleaseSchema>;

/** One release, as the page needs it. */
export interface Release {
  /** The tag, e.g. `v1.3.0` — also the entry's anchor. */
  tag: string;
  /**
   * The narrative half of the release name, with the version removed.
   *
   * GitHub's `name` already begins with the tag: `v1.3.0 — the console gets a
   * manual`. Rendering the tag beside it unsplit would print the version twice,
   * so the em-dash is the seam. A name that does not follow the convention is
   * left whole rather than guessed at.
   */
  title: string;
  /** ISO date, no time — `formatDate` is the site's one date formatter. */
  date: string;
  /** The canonical release page on github.com. */
  url: string;
  /** The markdown body, verbatim. Empty when the release has none. */
  body: string;
}

/**
 * Split `v1.3.0 — the console gets a manual` into its version and its story.
 *
 * The separator is an em-dash surrounded by spaces, which is how every release
 * here is titled. Anything else — a name with no dash, or one that does not
 * start with its own tag — is returned whole, because a wrong guess would drop
 * words from a title and a missed split only repeats a version.
 */
export function narrativeTitle(name: string | null, tag: string): string {
  if (!name) return tag;
  if (!name.startsWith(tag)) return name;

  const rest = name.slice(tag.length).trimStart();
  return rest.startsWith('—') ? rest.slice(1).trim() || name : name;
}

/** Published releases only, newest first. */
function toReleases(raw: RawRelease[]): Release[] {
  return raw
    .filter((release) => !release.draft && !release.prerelease && release.published_at)
    .map((release) => ({
      tag: release.tag_name,
      title: narrativeTitle(release.name, release.tag_name),
      // The API sends a full timestamp; `formatDate` takes a calendar date.
      date: (release.published_at ?? '').slice(0, 10),
      url: release.html_url,
      body: release.body ?? '',
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** The formatted publish date, so the page never reaches for a second formatter. */
export function releaseDate(release: Release): string {
  return formatDate(release.date);
}

/**
 * An optional token, and genuinely optional.
 *
 * The public endpoint allows 60 requests an hour per IP and this build makes
 * one, so the unauthenticated path is the expected one. The header exists as an
 * escape hatch for the day a shared Vercel build IP runs into somebody else's
 * budget — declared in `turbo.json`'s `build.env` so turbo passes it through and
 * so its presence is part of the cache key.
 */
function authHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  return token ? { authorization: `Bearer ${token}` } : {};
}

/**
 * Every published release, or `null` when the build could not establish what
 * they are.
 *
 * `null` is the fail-open signal and covers two different failures on purpose:
 * the request did not succeed, and the response did not describe releases. The
 * second is the one worth naming — a 200 carrying something unexpected would
 * otherwise render a page-shaped nothing, which reads as "no releases yet"
 * rather than as a fault. Both land on the same written note — see
 * `CHANGELOG_UNAVAILABLE_NOTE` in `lib/site.ts`.
 *
 * The build does not fail, because a GitHub outage must not block a blog deploy
 * that has nothing to do with releases. That trade has a cost — a silent
 * unavailable page — and it is paid by the scheduled check in
 * `.github/workflows/changelog-check.yml`, which reads the deployed page and
 * fails when it finds that note. Nothing reports from here: a prerender has no
 * error reporter installed and `@gate/logger` is silent under production, so a
 * `logger.error` on this path would be a comforting no-op.
 *
 * `'use cache'` is not decoration either. Under Cache Components an uncached
 * fetch during a prerender is a build error, so this scope is what makes the
 * route static at all — the same reason `PostBody` and `lib/og.tsx` have one.
 */
export async function getReleases(): Promise<Release[] | null> {
  'use cache';
  // `'max'` for the same reason the post bodies use it — the answer holds for
  // the life of the deployment. What makes a *new* release appear is a new
  // build, and the release workflow asks for one that does not restore this
  // cache — see .github/workflows/changelog-deploy.yml.
  cacheLife('max');

  if (process.env.BLOG_RELEASES_FIXTURE === '1') return toReleases(RELEASES_FIXTURE);

  try {
    const response = await fetch(RELEASES_API_URL, {
      headers: {
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        ...authHeaders(),
      },
    });
    if (!response.ok) return null;

    const parsed = ReleasesSchema.safeParse(await response.json());
    return parsed.success ? toReleases(parsed.data) : null;
  } catch {
    return null;
  }
}
