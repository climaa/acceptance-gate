/**
 * An App Router app's routes and where each one's loading, error and not-found
 * boundary comes from, read from its file list alone (no build, no import).
 *
 * A route is a directory holding a `page` file. Its URL drops route groups
 * (`(site)`); a parallel slot (`@modal`), an intercepting route (`(.)shot`) and a
 * private folder (`_screens`) are not routes of their own, so nothing under one
 * is listed. A boundary is `own` when the route's directory has the file,
 * `inherited` when an ancestor directory has it (it wraps every segment below),
 * and `none` otherwise.
 */
import type { BoundarySource } from '../gaps.ts';

export interface RouteState {
  route: string;
  loading: BoundarySource;
  error: BoundarySource;
  notFound: BoundarySource;
}

const PAGE = /^page\.(tsx|ts|jsx|js|mdx)$/;
const BOUNDARY = {
  loading: /^loading\.(tsx|ts|jsx|js)$/,
  error: /^(error|global-error)\.(tsx|ts|jsx|js)$/,
  notFound: /^not-found\.(tsx|ts|jsx|js)$/,
} as const;

const isSkipped = (segment: string) =>
  segment.startsWith('@') || segment.startsWith('_') || /^\(\.+\)/.test(segment);
const isGroup = (segment: string) => /^\([^.].*\)$/.test(segment);

/** `(site)/blog/[slug]` → `/blog/[slug]`. */
function urlOf(dir: string[]): string {
  return `/${dir.filter((segment) => !isGroup(segment)).join('/')}`;
}

function sourceOf(dir: string[], dirsWith: ReadonlySet<string>): BoundarySource {
  if (dirsWith.has(dir.join('/'))) return 'own';
  for (let depth = dir.length - 1; depth >= 0; depth -= 1) {
    if (dirsWith.has(dir.slice(0, depth).join('/'))) return 'inherited';
  }
  return 'none';
}

/** The directories holding a file whose name matches `pattern`, as `a/b` (`''` for the root). */
function dirsMatching(files: readonly string[][], pattern: RegExp): Set<string> {
  return new Set(
    files
      .filter((parts) => pattern.test(String(parts.at(-1))))
      .map((parts) => parts.slice(0, -1).join('/')),
  );
}

/** Every route in `files` (paths relative to the app's `app/` directory), sorted by URL. */
export function routeStates(files: readonly string[]): RouteState[] {
  const parts = files.map((file) => file.split('/'));
  const boundaries = {
    loading: dirsMatching(parts, BOUNDARY.loading),
    error: dirsMatching(parts, BOUNDARY.error),
    notFound: dirsMatching(parts, BOUNDARY.notFound),
  };
  return (
    parts
      .filter((p) => PAGE.test(String(p.at(-1))) && !p.slice(0, -1).some(isSkipped))
      .map((p) => p.slice(0, -1))
      .map((dir) => ({
        route: urlOf(dir),
        loading: sourceOf(dir, boundaries.loading),
        error: sourceOf(dir, boundaries.error),
        notFound: sourceOf(dir, boundaries.notFound),
      }))
      // Each page has its own directory, so two routes never share a URL.
      .sort((a, b) => (a.route < b.route ? -1 : 1))
  );
}

type Tally = { own: number; inherited: number; none: number };

function tally(
  routes: readonly RouteState[],
  key: 'loading' | 'error' | 'notFound',
): Tally {
  const counts: Tally = { own: 0, inherited: 0, none: 0 };
  for (const route of routes) counts[route[key]] += 1;
  return counts;
}

/** The counts the Visual dimension carries for an app's routes. */
export function routeSummary(routes: readonly RouteState[]) {
  return {
    total: routes.length,
    loading: tally(routes, 'loading'),
    error: tally(routes, 'error'),
    notFound: tally(routes, 'notFound'),
  };
}
