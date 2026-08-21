import type { Metadata } from 'next';
import NextLink from 'next/link';
import { EmptyState, Link, Stack } from '@gate/ui';
import { NOT_FOUND_ACTION, NOT_FOUND_NOTE, NOT_FOUND_TITLE } from '@/lib/site';

/**
 * What every miss in this app renders: an unknown route, and every `notFound()`
 * a route calls.
 *
 * It exists for one arrival in particular. A `view` link is drawn from a report
 * id, and a reviewer can delete that report from the panel beside it — the
 * console reconciles the two now (see components/HistoryTable.tsx), but a page
 * rendered before the delete is still on screen after it, and its links still
 * point at what is gone. That reader has taken no wrong turn and needs a way
 * back; Next's built-in 404 is a bare pair of words with no route anywhere.
 *
 * This page adds no dynamic hole of its own — nothing below reads the request.
 * The route still builds as a partial prerender, because the shell above it has
 * one: the sample-data notice resolves the data directory per request (see
 * app/layout.tsx), and every route in the app inherits that boundary.
 *
 * Note what this page CANNOT do. Rendered under `/report/[id]`'s `<Suspense>`,
 * `notFound()` fires after the shell has already streamed, so the response
 * carries `200` with this body inside it — the status is committed before the
 * miss is discovered. That is the cost of the static shell that page chose on
 * purpose, and it is why anything checking for a miss here has to match this
 * copy rather than the status code.
 */

export const metadata: Metadata = { title: NOT_FOUND_TITLE };

export default function NotFound() {
  return (
    <Stack gap={6}>
      <EmptyState
        message={NOT_FOUND_NOTE}
        action={
          <Link as={NextLink} href="/">
            {NOT_FOUND_ACTION}
          </Link>
        }
      />
    </Stack>
  );
}
