/**
 * What `/changelog` is built from everywhere except production.
 *
 * The page's only input is a network response, and a build is the one place a
 * test cannot reach past — Playwright starts an already-built app, and the
 * vitest alias that stubs `next/cache` never runs during `next build`. So the
 * switch lives in the build itself: `BLOG_RELEASES_FIXTURE=1` and the fetch is
 * never made. CI sets it for the `build` matrix leg and for e2e; Vercel leaves
 * it unset and does the real fetch.
 *
 * Written rather than captured. A dump of the four live releases would exercise
 * only the shapes that happen to exist today; these entries are trimmed to the
 * cases the reference-autolinking has to get right and would otherwise be
 * tested nowhere:
 *
 * - `v0.3.0` carries a compare URL as a bare autolink, `v0.2.0` carries none —
 *   two of the four real releases have no compare line, so absent is the
 *   ordinary case rather than the error case.
 * - `#12` appears bare, already linked as `[#9](…/pull/9)`, and inside a code
 *   span. Only the first may be turned into a link.
 * - `v0.1.0` has a body with no references at all, and `v0.2.0` has a GFM table,
 *   because two of the real four use tables heavily and two use none.
 *
 * Dates are fixed and the versions are deliberately not the live ones: a
 * fixture that mirrors production invites the assertion that production is
 * correct because the fixture was.
 */
import type { RawRelease } from '../lib/releases';
const REPO = 'https://github.com/climaa/acceptance-gate';

export const RELEASES_FIXTURE: RawRelease[] = [
  // Typed by the schema's own inferred type (imported above), so tightening the
  // schema fails this file rather than quietly leaving CI on a looser shape.
  {
    tag_name: 'v0.3.0',
    name: 'v0.3.0 — the third fixture release, with a compare link',
    html_url: `${REPO}/releases/tag/v0.3.0`,
    published_at: '2026-03-14T10:00:00Z',
    body: [
      '## What changed',
      '',
      'A bare reference to #12, an explicit one to [#9](' + REPO + '/pull/9), and',
      'one inside a code span: `Closes #12`. Only the first is a link.',
      '',
      '**Full changelog:** ' + REPO + '/compare/v0.2.0...v0.3.0',
    ].join('\n'),
    draft: false,
    prerelease: false,
  },
  {
    tag_name: 'v0.2.0',
    name: 'v0.2.0 — the second fixture release, with a table and no compare link',
    html_url: `${REPO}/releases/tag/v0.2.0`,
    published_at: '2026-02-08T09:30:00Z',
    body: [
      '## What changed',
      '',
      '| Change | Why |',
      '| ------ | --- |',
      '| A table row | Because two of the four real bodies lean on tables |',
      '| A second row referencing #7 | So a reference inside a table is covered |',
      '',
      'No compare line here, on purpose.',
    ].join('\n'),
    draft: false,
    prerelease: false,
  },
  {
    tag_name: 'v0.1.0',
    name: 'v0.1.0 — the first fixture release',
    html_url: `${REPO}/releases/tag/v0.1.0`,
    published_at: '2026-01-05T08:15:00Z',
    body: 'A plain body. No headings, no references, no table.',
    draft: false,
    prerelease: false,
  },
  {
    // Published with no title of its own, which is what GitHub's default name
    // produces. The page must render the tag as the heading and drop the badge
    // that would otherwise repeat it.
    tag_name: 'v0.0.9',
    name: 'v0.0.9',
    html_url: `${REPO}/releases/tag/v0.0.9`,
    published_at: '2025-12-20T11:00:00Z',
    body: 'A release nobody wrote a title for.',
    draft: false,
    prerelease: false,
  },
  {
    tag_name: 'v0.4.0-rc.1',
    name: 'v0.4.0-rc.1 — a prerelease, which the page must not show',
    html_url: `${REPO}/releases/tag/v0.4.0-rc.1`,
    published_at: '2026-04-01T00:00:00Z',
    body: 'If this renders, the prerelease filter is not doing its job.',
    draft: false,
    prerelease: true,
  },
  {
    tag_name: 'v0.5.0',
    name: 'v0.5.0 — a draft, which the page must not show',
    html_url: `${REPO}/releases/tag/v0.5.0`,
    published_at: null,
    body: 'If this renders, the draft filter is not doing its job.',
    draft: true,
    prerelease: false,
  },
];
