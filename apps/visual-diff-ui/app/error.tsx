'use client';

import { useEffect } from 'react';

import { logger } from '@gate/logger';
import { Button, EmptyState, Stack } from '@gate/ui';
import { ERROR_ACTION, ERROR_NOTE } from '@/lib/site';

/**
 * The boundary for both routes: the console and `/report/[id]`.
 *
 * It earns its place here more than in most apps. `lib/data.ts` throws by
 * design when a summary it was asked for is malformed — a report that drifted
 * from the schema is a failure worth seeing, not an empty list — and every
 * `parseFile` call behind the console does the same. Until this file existed
 * each of those rendered Next's built-in error page, outside the shell, with no
 * way back.
 *
 * `retry`, not `reset` — the Next 16 name. It re-fetches the segment as well as
 * re-rendering it, which is the right one here: the readers below are cached
 * with `cacheLife('seconds')`, so a report rewritten since the failure is
 * genuinely reachable on a second press.
 *
 * `error` is read but never rendered: in production its message is redacted to
 * a generic string and the real text goes to the platform's logs under
 * `error.digest`, so showing either tells the reviewer nothing. Reporting it is
 * the opposite act — the stack and the digest are what a reporter wants, and a
 * malformed summary is precisely the failure someone needs to hear about rather
 * than only the reviewer who tripped over it. `logger.error` prints under
 * `next dev` and, in a production build, prints nothing and hands the error to
 * the reporter instead: a no-op until an error tracker claims the slot, with
 * nothing here changing when one does. The `Error` goes over as itself rather
 * than as a formatted string, which the reporter recovers positionally and
 * which a string would cost its stack. Keyed on `error`, so a re-render reports
 * nothing and a second, different failure reports again.
 *
 * No `role="alert"`, and that is a constraint rather than a preference —
 * apps/e2e/pages/console.ts matches console refusals with a strict
 * `getByRole('main').getByRole('alert')`, so a second alert inside `main`
 * breaks every scenario that reads one. `EmptyState` renders a plain paragraph,
 * which is what this needs: the reader is looking at the page already.
 */
export default function Error({ error, retry }: { error: Error; retry: () => void }) {
  useEffect(() => {
    logger.error(error);
  }, [error]);

  return (
    <Stack gap={6}>
      <EmptyState
        message={ERROR_NOTE}
        action={<Button onClick={retry}>{ERROR_ACTION}</Button>}
      />
    </Stack>
  );
}
