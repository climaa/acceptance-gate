'use client';

import { useEffect } from 'react';

import { logger } from '@gate/logger';
import { BlogIndexTemplate, Button } from '@gate/ui';
import { ERROR_ACTION, ERROR_NOTE, ERROR_TITLE } from '@/lib/site';

/**
 * The boundary for everything under the root layout: a post whose frontmatter
 * parses but whose body throws, a highlighter that fails on one fence, a tag
 * page whose posts read wrong. Without this file each of those renders Next's
 * built-in error page, which carries none of this site's type, theme or footer.
 *
 * `retry`, not `reset` — Next 16 renamed the prop and re-fetches the segment's
 * data as well as re-rendering it, which is what a transient failure needs.
 * `reset` still exists and only clears the boundary's state; it is the wrong
 * one here, where every input is a file this build already read.
 *
 * `error` is read but never rendered, and that split is the whole point of it.
 * In production React replaces a server error's message with a generic one and
 * hands the real text to the platform's logs under `error.digest`, so SHOWING
 * either would give the reader a string that says nothing or belongs in a log.
 * REPORTING is the opposite act: the stack and the digest are exactly what a
 * reporter wants. `logger.error` prints under `next dev` and, in a production
 * build where this page is otherwise the only trace a failure leaves, is silent
 * and hands the error to the reporter instead — a no-op until an error tracker
 * claims the slot, with nothing here changing when one does. The `Error` goes
 * over as itself rather than as a formatted string: the reporter recovers it
 * from the arguments positionally, and a string would cost it the stack.
 *
 * Keyed on `error`, so a re-render reports nothing and a second, different
 * failure in the same boundary reports again.
 *
 * `BlogIndexTemplate` rather than a bare `EmptyState`, for the same reason
 * `app/not-found.tsx` uses it: it is what gives this page an `<h1>` without an
 * app inventing type styles of its own.
 */
export default function Error({ error, retry }: { error: Error; retry: () => void }) {
  useEffect(() => {
    logger.error(error);
  }, [error]);

  return (
    <BlogIndexTemplate
      title={ERROR_TITLE}
      posts={[]}
      empty={ERROR_NOTE}
      emptyAction={<Button onClick={retry}>{ERROR_ACTION}</Button>}
    />
  );
}
