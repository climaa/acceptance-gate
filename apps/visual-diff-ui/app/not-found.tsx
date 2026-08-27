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
 * The status on it is `proxy.ts`'s doing, not this page's. Rendered under
 * `/report/[id]`'s `<Suspense>`, `notFound()` fires after the shell has already
 * streamed, so the status is spent before the miss is discovered — the cost of
 * the static shell that page chose on purpose. The proxy recognises an unknown
 * report ahead of routing and rewrites here with a real `404`. It fails open by
 * design, so a deployment shipped without the reports tree still answers `200`
 * with this body; anything that must hold in both cases matches this copy
 * rather than the status code.
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
