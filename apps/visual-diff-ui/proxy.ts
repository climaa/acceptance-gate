import * as fs from 'node:fs';
import * as path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { dataDirFrom } from '@/lib/data-dir';
import { ReportIdSchema, hasReport } from '@/lib/jobs';

/**
 * The one thing the report route cannot do for itself: answer a miss with a
 * `404`.
 *
 * `/report/[id]` calls `notFound()` when there is no such report, and that
 * renders the right page — with a `200` on it. A response's status goes out
 * with its first byte, and under `cacheComponents` every route has a
 * prerendered shell that Next sends before the page's own reads resolve. So by
 * the time the page knows the report is missing, the status is spent. This was
 * measured, not assumed: moving the read above the `<Suspense>` still answered
 * `200` with `x-nextjs-postponed: 1`, and so did adding `export const instant =
 * false` to the page and the root layout together. `export const dynamic` is
 * rejected outright with `cacheComponents` on.
 *
 * A proxy runs before any of that — before routing, before a byte is sent — so
 * it is the only place left that can still choose the status. It answers ONLY
 * the miss. A report that exists falls through untouched and keeps the static
 * shell it has today, which is what makes this better than making the route
 * dynamic: the fast path stays fast and only the 404 pays.
 *
 * What it must not become: a second opinion about what a report is. The
 * directory comes from `dataDirFrom` and the existence check is `hasReport` —
 * the same two the page and the API use. A proxy with its own idea of either
 * would start refusing reports the page can render the first time they drifted.
 *
 * And it speaks only when it can see. A proxy is bundled as its own function,
 * so "no such report" and "this function was shipped without the tree to look
 * in" are the same `false` from here — and answering the second one with a 404
 * would take every report on a deployment down at once, including the sample
 * ones. So the tree is checked first, and a proxy that cannot see it says
 * nothing and lets the route answer exactly as it did before this file
 * existed. Wrong-but-harmless beats confidently wrong.
 */

/** Only the report route. Every other path — the console, the API, the assets —
 *  reaches the router without this file running at all. */
export const config = { matcher: '/report/:id' };

const REPORT_PREFIX = '/report/';

/**
 * Whether that path names a report this instance does not have.
 *
 * The decision, kept apart from the response so it can be tested as one. The
 * `next/server` stub under vitest exports `connection()` and nothing else, on
 * the stated grounds that a fake `NextRequest` would hide the moment something
 * started depending on the real one — so the part with the logic in it takes a
 * string, and the part that needs Next is the single line below.
 */
export function isMissingReport(pathname: string): boolean {
  const { dir } = dataDirFrom();
  if (!canSeeReports(dir)) return false;

  const id = decodeURIComponent(pathname.slice(REPORT_PREFIX.length));

  // Shape first, as every other reader of an id does: `hasReport` answers a
  // climb by throwing, and a throw here is a 500 on a path whose whole job is
  // to produce a 404.
  return !ReportIdSchema.safeParse(id).success || !hasReport(dir, id);
}

export function proxy(request: NextRequest): NextResponse | undefined {
  if (!isMissingReport(request.nextUrl.pathname)) return undefined;

  // Rewritten rather than redirected: the address a reviewer followed is the
  // address they should still be looking at when they read what is wrong with
  // it. `/_not-found` is the App Router's own entry to app/not-found.tsx, so
  // this answers with the same page the route's own `notFound()` renders —
  // now with the status to match.
  return NextResponse.rewrite(new URL('/_not-found', request.url), { status: 404 });
}

/** Whether there is a `reports/` tree here to have an opinion about. An
 *  instance that has compared nothing has none, and neither does a function
 *  bundled without the data it reads — both are reasons to stay quiet. */
function canSeeReports(dir: string): boolean {
  try {
    return fs.statSync(path.join(dir, 'reports')).isDirectory();
  } catch {
    return false;
  }
}
