import type { Metadata } from 'next';
import NextLink from 'next/link';
import { Link, Prose, Stack } from '@gate/ui';
import { NOT_FOUND_ACTION, NOT_FOUND_NOTE, NOT_FOUND_TITLE } from '@/lib/site';

/**
 * What every miss renders: an address no route matches, and the `notFound()`
 * `app/[slug]/page.tsx` calls for a slug the allowlist does not name.
 *
 * It carries a real `404`, and under `cacheComponents` that takes work that
 * happens elsewhere. A status goes out with the response's first byte, and
 * `/[slug]` streams a prerendered shell before its own reads resolve — so a
 * slug discovered to be unknown mid-render is discovered too late to set one.
 * `dynamicParams = false` would refuse it ahead of any render and the build
 * rejects that export outright with the flag on. `proxy.ts` closes it instead,
 * rewriting here with the status attached; see that file for the measurements.
 *
 * Without this file the rewrite still lands somewhere — Next's built-in page,
 * inside this app's header and footer but carrying none of its type and no way
 * onward. That is what this replaces.
 */
export const metadata: Metadata = { title: NOT_FOUND_TITLE };

export default function NotFound() {
  return (
    <Stack gap={4}>
      <h1 className="manual-title">{NOT_FOUND_TITLE}</h1>
      <Prose>
        <p>{NOT_FOUND_NOTE}</p>
      </Prose>
      <div>
        <Link as={NextLink} href="/">
          {NOT_FOUND_ACTION}
        </Link>
      </div>
    </Stack>
  );
}
