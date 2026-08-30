import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { MANUAL_PAGES } from '@/lib/allowlist';
import { proxy } from '../proxy';

/**
 * Which addresses reach a route and which are refused before one renders.
 *
 * What this cannot say is that the response line itself was a `404` rather than
 * a `200` with a not-found body streamed inside it — which is the entire defect
 * this file exists for. Only something speaking HTTP end to end can. `apps/blog`
 * has two acceptance scenarios for exactly that; this app has none, because its
 * own pages are not in the suite. So the status was measured by hand against a
 * production build, and what lives here is the decision underneath it: which
 * addresses the check calls known, and which inputs would make it refuse a page
 * that works.
 */

/** The response line, or `null` when the proxy let the request through. */
function statusOf(pathname: string): number | null {
  const response = proxy(new NextRequest(new URL(pathname, 'http://localhost:3400')));

  // `NextResponse.next()` is a 200 carrying the continue header; only a rewrite
  // sets a status of its own, so the header is what separates "passed through"
  // from "refused".
  return response.headers.get('x-middleware-next') ? null : response.status;
}

describe('proxy', () => {
  it('lets every published page through', () => {
    const refused = MANUAL_PAGES.filter((page) => statusOf(`/${page.slug}`) !== null);

    expect(refused.map((page) => page.slug)).toEqual([]);
  });

  it('refuses a slug that names no page', () => {
    expect(statusOf('/esto-no-existe-jamas-12345')).toBe(404);
  });

  it('sends a refusal to the app’s own not-found page', () => {
    const response = proxy(new NextRequest(new URL('/nope', 'http://localhost:3400')));

    expect(response.headers.get('x-middleware-rewrite')).toContain('/_not-found');
  });

  // The regression this check could most easily cause. A root-level matcher sees
  // static files as slugs, and refusing them would take out the favicon and
  // every image stage 2 commits under public/.
  it('lets a root-level static file through', () => {
    const files = ['/favicon.ico', '/robots.txt', '/opengraph-image.png'];

    const refused = files.filter((file) => statusOf(file) !== null);

    expect(refused).toEqual([]);
  });

  it('lets the index through', () => {
    expect(statusOf('/')).toBeNull();
  });

  // This file rewrites to `/_not-found`, which a one-segment matcher also
  // matches. Next renders the page either way, so this pins an invariant rather
  // than a fix: a check must not refuse its own destination.
  it('lets its own rewrite target through instead of refusing it again', () => {
    expect(statusOf('/_not-found')).toBeNull();
  });
});
