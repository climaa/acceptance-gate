'use client';

import { useEffect } from 'react';

import { logger } from '@gate/logger';
import { Button, Prose, Stack } from '@gate/ui';
import { ERROR_ACTION, ERROR_NOTE, ERROR_TITLE } from '@/lib/site';

/**
 * The boundary for everything under the root layout. What can actually throw
 * here is narrow and worth naming: `lib/features.ts` refuses any Gherkin
 * construct the pages do not render, and while that is a build failure for the
 * three published features, `/[slug]`'s request-time branch can reach it too.
 * Without this file each such throw renders Next's built-in error page, which
 * carries none of this app's type, theme or footer.
 *
 * `retry`, not `reset` — Next 16 renamed the prop and re-fetches the segment's
 * data as well as re-rendering it, which is what a transient failure needs.
 *
 * `error` is read but never rendered, and that split is the point. In production
 * React replaces a server error's message with a generic one and hands the real
 * text to the platform's logs under `error.digest`, so showing either would give
 * the reader a string that says nothing or belongs in a log. Reporting is the
 * opposite act. `logger.error` prints under `next dev` and is silent in a
 * production build, handing the error to a reporter instead — a no-op until an
 * error tracker claims the slot. The `Error` goes over as itself rather than as
 * a formatted string: a string would cost the reporter the stack.
 *
 * Keyed on `error`, so a re-render reports nothing and a second, different
 * failure in the same boundary reports again.
 */
export default function Error({ error, retry }: { error: Error; retry: () => void }) {
  useEffect(() => {
    logger.error(error);
  }, [error]);

  return (
    <Stack gap={4}>
      <h1 className="manual-title">{ERROR_TITLE}</h1>
      <Prose>
        <p>{ERROR_NOTE}</p>
      </Prose>
      <div>
        <Button onClick={retry}>{ERROR_ACTION}</Button>
      </div>
    </Stack>
  );
}
