import { NextResponse, type NextRequest } from 'next/server';
import { getAllPosts, getAllTags, tagSlug } from '@/lib/posts';

/**
 * The one thing a route under `cacheComponents` cannot do for itself: answer a
 * miss with a 404.
 *
 * `/blog/[slug]` and `/tags/[tag]` both stream. Their App Shell — the header,
 * the footer, the segment's `loading.tsx` — goes out before the body renders,
 * so the status line is already on the wire by the time `notFound()` runs below
 * it. Next says so in as many words (`file-conventions/loading`, Status Codes):
 * a streamed response is a `200`, the miss is communicated inside the stream,
 * and "if you need a 404 status ... ensure the resource exists before the
 * response body is streamed. You can run this check in `proxy`." This is that
 * check.
 *
 * `export const dynamicParams = false` is what this would have been on any other
 * Next app, and the build refuses it outright here: "Route segment config
 * `dynamicParams` is not compatible with `nextConfig.cacheComponents`." The
 * option's own API reference says the same. (The Cache Components migration
 * guide claims the opposite in the same release. It is wrong; the build is the
 * arbiter.)
 *
 * Nothing to do with drafts, either. A slug that never existed behaved exactly
 * like a draft's, which is what makes this a segment-wide defect rather than a
 * hole in the draft filter — that filter works, and `getAllPosts()` below is the
 * same published-only list the routes prerender from.
 *
 * What this does NOT fix, because it was never broken: indexing. Next already
 * writes `<meta name="robots" content="noindex">` into a streamed miss, so no
 * crawler was going to index one of these. The status code is for everything
 * that reads status codes instead — analytics, uptime checks, link checkers,
 * and anyone reading this repo as a worked example.
 */

// Read once per instance rather than once per request: `getAllPosts()` parses
// the frontmatter of every post on disk, and this file now sits in front of
// every article. The content cannot change without a deployment, and a
// deployment is a new instance.
const POST_SLUGS = new Set(getAllPosts().map((post) => post.slug));
const TAG_SLUGS = new Set(getAllTags().map((tag) => tag.slug));

/** A stray `%` is "no such post", not a throw in front of the whole blog. */
function decodeParam(param: string): string | null {
  try {
    return decodeURIComponent(param);
  } catch {
    return null;
  }
}

// Both are `string | undefined` because a split says so, never because the
// matcher would let a one-segment path through.
function isKnown(segment: string | undefined, param: string | undefined): boolean {
  if (!segment || !param) return false;

  const decoded = decodeParam(param);
  if (decoded === null) return false;

  // Tags go through `tagSlug` on both sides, exactly as the page does, so
  // `/tags/CI` and `/tags/visual%20regression` stay the pages they already were.
  if (segment === 'tags') return TAG_SLUGS.has(tagSlug(decoded));

  return POST_SLUGS.has(decoded);
}

export function proxy(request: NextRequest) {
  const [, segment, param] = request.nextUrl.pathname.split('/');
  if (isKnown(segment, param)) return NextResponse.next();

  // Rewritten rather than answered from here, so the reader still gets the
  // site's own 404 page — header, footer, and the way back to the index — under
  // the status.
  return NextResponse.rewrite(new URL('/_not-found', request.url), { status: 404 });
}

// Exactly one segment deep on each: `/blog` and `/tags` are their own static
// pages, and `/blog/<slug>/opengraph-image` is meant to stay reachable even for
// a slug this file refuses — see `outputFileTracingIncludes` in next.config.mjs.
export const config = {
  matcher: ['/blog/:slug', '/tags/:tag'],
};
