import type { Metadata } from 'next';
import NextLink from 'next/link';
import { BlogIndexTemplate, Link } from '@gate/ui';
import { NOT_FOUND_ACTION, NOT_FOUND_NOTE, NOT_FOUND_TITLE } from '@/lib/site';

/**
 * What every miss on this site renders: an address no route matches, and every
 * `notFound()` a route calls.
 *
 * Note what this page CAN do, and what the console's cannot. The visual-diff
 * console's 404 (apps/visual-diff-ui/app/not-found.tsx) is reached from inside
 * `/report/[id]`'s `<Suspense>`, so the shell has already streamed and the
 * response carries `200` with that body inside it — anything checking for a
 * miss there has to match the copy rather than the status. Here both dynamic
 * segments declare `dynamicParams = false`, so an unknown slug or tag fails to
 * match a route before any render begins, and this page is served with a real
 * `404`.
 *
 * `BlogIndexTemplate` rather than a bare `EmptyState`: a heading and a
 * one-thing-to-do-next block below it is exactly the arrangement it already
 * owns, and it is what gives this page its `<h1>` without an app inventing type
 * styles of its own.
 */

export const metadata: Metadata = { title: NOT_FOUND_TITLE };

export default function NotFound() {
  return (
    <BlogIndexTemplate
      title={NOT_FOUND_TITLE}
      posts={[]}
      empty={NOT_FOUND_NOTE}
      emptyAction={
        <Link as={NextLink} href="/blog">
          {NOT_FOUND_ACTION}
        </Link>
      }
    />
  );
}
