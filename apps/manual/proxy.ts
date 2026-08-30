import { NextResponse, type NextRequest } from 'next/server';

import { findManualPage } from '@/lib/allowlist';

/**
 * The one thing a route under `cacheComponents` cannot do for itself: answer a
 * miss with a 404.
 *
 * `/[slug]` streams, so the App Shell above it is on the wire before
 * `notFound()` runs — the response line is already a `200` and the miss is
 * communicated inside the stream. Measured before this file existed:
 * `/nonsense` answered `200` with a not-found body, while `/a/b` answered `404`
 * because no route matched it at all.
 *
 * `export const dynamicParams = false` is what this would be on any other Next
 * app, and the build refuses it outright here — the option is not compatible
 * with `cacheComponents`. `apps/blog/proxy.ts` carries the long form of this
 * argument, the citations, and the note that indexing was never the problem
 * (Next already writes `noindex` into a streamed miss). This is the same defect
 * on a smaller app, so this file states the shape and points there for the rest.
 */
export function proxy(request: NextRequest) {
  const [slug] = request.nextUrl.pathname.split('/').filter(Boolean);

  // The matcher is one segment deep, but a root-level file arrives here looking
  // exactly like a slug — `/favicon.ico` today, and every image stage 2 commits
  // under `public/`. A dot separates the two: no page this app publishes has
  // one, and every static file does.
  if (!slug || slug.includes('.')) return NextResponse.next();

  // `_not-found` is the target this file rewrites to, and a one-segment matcher
  // matches it — so without this the rewritten request is refused a second time
  // on its way to the same page. Next resolves it either way, measured: the
  // reader gets `app/not-found.tsx` under a 404 with or without this line. It
  // stays because a check that refuses its own destination is a trap for the
  // next person to widen the matcher, not because it fixes a break today.
  // `apps/blog` never meets it at all — its matcher is two segments deep.
  if (slug.startsWith('_')) return NextResponse.next();

  if (findManualPage(slug)) return NextResponse.next();

  // Rewritten rather than answered from here, so the reader still gets
  // `app/not-found.tsx` — this app's own type, the header and footer, and a way
  // back to the index — under the status.
  return NextResponse.rewrite(new URL('/_not-found', request.url), { status: 404 });
}

// One segment: `/` is a static page of its own, and anything deeper matches no
// route and already answers 404 without help.
export const config = {
  matcher: ['/:slug'],
};
