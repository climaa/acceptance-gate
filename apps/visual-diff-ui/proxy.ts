import * as fs from 'node:fs';
import * as path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { dataDirFrom } from '@/lib/data-dir';
import { comparisonHref, isComparisonMode, parseComparisonPath } from '@/lib/comparison';
import { comparisonKeyIn, hasReport, hasSet } from '@/lib/jobs';
import { ReportIdSchema, SetLabelSchema } from '@/lib/job-contract';
import { CANONICAL_LABEL } from '@/lib/baselines';
import { setDirOf } from '@/lib/paths';
import { parseShotViewPath } from '@/lib/shots';
import { parseVariantKey } from '@gate/visual-diff/policy';

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

/** Only the four routes that can miss. Every other path — the console, the API,
 *  the assets, a comparison's card — reaches the router without this file
 *  running at all. */
export const config = {
  matcher: [
    '/report/:id',
    '/report/:id/compare/:key',
    '/set/:label',
    '/set/:label/shot/:key',
  ],
};

const REPORT_PREFIX = '/report/';
const SET_PREFIX = '/set/';

/**
 * The segment after `prefix`, decoded, or null for one that will not decode.
 *
 * `decodeURIComponent('%')` throws `URIError`, and a throw from here is a 500 on
 * the one path whose entire job is to produce a 404 — measured: `/report/%` and
 * `/set/%` both answered 500 before this existed. Null rather than a throw, so
 * each caller decides what an undecodable segment means to it, the same shape
 * lib/paths.ts uses for a path it will not build.
 */
function segmentAfter(pathname: string, prefix: string): string | null {
  try {
    return decodeURIComponent(pathname.slice(prefix.length));
  } catch {
    return null;
  }
}

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

  const id = segmentAfter(pathname, REPORT_PREFIX);
  if (id === null) return true;

  // Shape first, as every other reader of an id does: `hasReport` answers a
  // climb by throwing, and a throw here is a 500 on a path whose whole job is
  // to produce a 404.
  return !ReportIdSchema.safeParse(id).success || !hasReport(dir, id);
}

/**
 * Whether that path names a screenshot set this instance cannot show.
 *
 * Three answers, in the order that needs the least to decide:
 *
 *  - a segment that is not a label is a miss with no tree consulted at all. The
 *    report route has to look first; this one does not, because "not a label" is
 *    a fact about the string.
 *  - `baselines` is never a miss FROM HERE. The corpus lives in the checkout,
 *    not the data directory, and a proxy is bundled as its own function — so "no
 *    corpus" and "this function shipped without the checkout" are the same
 *    answer here, and the page has an empty state that tells them apart at 200.
 *    Deciding otherwise would also pull lib/git.ts, and `node:child_process`,
 *    into this bundle for the first time.
 *  - otherwise the same pair the delete route uses, so the proxy never holds a
 *    second opinion about what a set is.
 */
export function isMissingSet(pathname: string): boolean {
  const label = segmentAfter(pathname, SET_PREFIX);
  if (label === null || !SetLabelSchema.safeParse(label).success) return true;
  if (label === CANONICAL_LABEL) return false;

  const { dir } = dataDirFrom();

  return canSeeSets(dir) && !hasSet(dir, label);
}

/**
 * Whether that path names a screenshot this instance cannot show — the shot
 * view's miss, answered for the reason the set's is.
 *
 * A key that is no variant's is a miss before any tree is read, as a label that
 * is not one is. The corpus is never a miss from here, for `isMissingSet`'s
 * reason. Otherwise the set must be one this instance holds and the shot a file
 * in it: the same PNG the set viewer would have drawn a link to.
 */
export function isMissingShot(pathname: string): boolean {
  const segments = parseShotViewPath(pathname);
  if (segments === null) return true;

  const { label, key } = segments;
  if (!SetLabelSchema.safeParse(label).success || parseVariantKey(key) === null)
    return true;
  if (label === CANONICAL_LABEL) return false;

  const { dir } = dataDirFrom();
  if (!canSeeSets(dir)) return false;

  const setDir = setDirOf(dir, label);

  return setDir === null || !fs.existsSync(path.join(setDir, `${key}.png`));
}

/** What the proxy does with a request: let it through, answer it with the
 *  404 page, or send it to the one address it names. */
export type ProxyAnswer =
  { kind: 'pass' } | { kind: 'missing' } | { kind: 'redirect'; to: string };

const PASS: ProxyAnswer = { kind: 'pass' };
const MISSING: ProxyAnswer = { kind: 'missing' };

/**
 * The answer for `/report/<id>/compare/<param>`.
 *
 * A miss is a 404 for the same reason a report's is, and it is never a blank
 * modal: the dialog only renders over a variant the page found. A segment that
 * names a comparison by anything but its key — a bare story id, which the old
 * `?story=` links carried — is redirected onto the key, so one comparison is
 * counted, cached and previewed under one address.
 */
export function comparisonAnswer(pathname: string, search = ''): ProxyAnswer {
  const segments = parseComparisonPath(pathname);
  if (segments === null) return MISSING;

  const { dir } = dataDirFrom();
  if (!canSeeReports(dir)) return PASS;

  const { reportId: id, key: param } = segments;
  if (!ReportIdSchema.safeParse(id).success || !hasReport(dir, id)) return MISSING;

  const key = comparisonKeyIn(dir, id, param);
  if (key === null) return MISSING;
  if (key === param) return PASS;

  return { kind: 'redirect', to: `${comparisonHref(id, key)}${search}` };
}

/**
 * The answer for `/report/<id>`: a 404 for a report this instance lacks, and a
 * redirect for a link written before comparisons had paths of their own.
 *
 * Those carried the open modal as `?story=<key or story id>&mode=<mode>`, and
 * they are already out in the world. The redirect does not look the story up —
 * the comparison's own answer above does that on arrival, so there is one
 * place that decides what a story parameter names.
 */
export function reportAnswer(pathname: string, search = ''): ProxyAnswer {
  if (isMissingReport(pathname)) return MISSING;

  const params = new URLSearchParams(search);
  const story = params.get('story');
  const id = segmentAfter(pathname, REPORT_PREFIX);
  if (!story || id === null) return PASS;

  const mode = params.get('mode');

  return {
    kind: 'redirect',
    to: comparisonHref(id, story, isComparisonMode(mode) ? mode : null),
  };
}

function answerFor(pathname: string, search: string): ProxyAnswer {
  if (pathname.startsWith(SET_PREFIX)) {
    const missing = pathname.includes('/shot/') ? isMissingShot : isMissingSet;

    return missing(pathname) ? MISSING : PASS;
  }
  // The matcher sends nothing else under a report's path, so a request that is
  // not the report itself is a comparison — or a malformed one, which the
  // parser turns into a miss.
  if (
    pathname.startsWith(REPORT_PREFIX) &&
    pathname.slice(REPORT_PREFIX.length).includes('/')
  ) {
    return comparisonAnswer(pathname, search);
  }

  return reportAnswer(pathname, search);
}

export function proxy(request: NextRequest): NextResponse | undefined {
  const { pathname, search } = request.nextUrl;
  const answer = answerFor(pathname, search);

  if (answer.kind === 'pass') return undefined;
  if (answer.kind === 'redirect') {
    return NextResponse.redirect(new URL(answer.to, request.url), 307);
  }

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

/** The same question for `sets/`, and the same reason for asking it. */
function canSeeSets(dir: string): boolean {
  try {
    return fs.statSync(path.join(dir, 'sets')).isDirectory();
  } catch {
    return false;
  }
}
