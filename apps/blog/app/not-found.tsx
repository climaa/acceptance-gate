import type { Metadata } from 'next';
import NextLink from 'next/link';
import { BlogIndexTemplate, Link } from '@gate/ui';
import { NOT_FOUND_ACTION, NOT_FOUND_NOTE, NOT_FOUND_TITLE } from '@/lib/site';

/**
 * What every miss on this site renders: an address no route matches, and every
 * `notFound()` a route calls.
 *
 * It carries a real `404`, and under `cacheComponents` that takes work. A
 * status goes out with the response's first byte, and every route here has a
 * prerendered shell Next sends before the page's own reads resolve — so a slug
 * discovered to be unknown mid-render is discovered too late to set one.
 * `dynamicParams = false` would have refused it ahead of any render, but the
 * build rejects that export outright with the flag on. `proxy.ts` closes it
 * instead: it runs before routing, recognizes the miss, and rewrites here with
 * the status attached. See that file for the measurements, and for why it stays
 * quiet when it cannot see the content tree.
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
