/**
 * The repository the changelog reports on, and the URLs derived from it.
 *
 * Separate from `lib/releases.ts` so the remark plugin that autolinks `#NNN`
 * can name the same repository without importing the fetch and its schema.
 */
const GITHUB_REPO = 'climaa/acceptance-gate';

/** Where the releases live on github.com — the way on when the fetch failed. */
export const RELEASES_PAGE_URL = `https://github.com/${GITHUB_REPO}/releases`;

/**
 * The destination for an autolinked `#NNN`.
 *
 * Always the issues path, never `/pull/`: GitHub redirects an issue URL to the
 * pull request when the number happens to be one, so a single URL shape covers
 * both and the renderer never has to know which it is.
 */
export const ISSUE_URL_BASE = `https://github.com/${GITHUB_REPO}/issues`;

/** The published releases, newest first, 100 at a time. */
export const RELEASES_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=100`;
