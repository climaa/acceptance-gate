'use client';

import { useEffect } from 'react';

import { logger } from '@gate/logger';
import { Button, EmptyState } from '@gate/ui';

/**
 * The boundary for everything under the shell, so a failure renders inside
 * census's own frame and theme rather than Next's built-in page. The error is
 * reported, never shown: in production its message is React's generic one and
 * the real text is in the platform's logs under `error.digest`.
 */
export default function Error({ error, retry }: { error: Error; retry: () => void }) {
  useEffect(() => {
    logger.error(error);
  }, [error]);

  return (
    <main className="census-main">
      <h1 className="census-title">Census</h1>
      <EmptyState
        message="This page could not be drawn."
        action={<Button onClick={retry}>Try again</Button>}
      />
    </main>
  );
}
