'use client';

import type { ReactNode } from 'react';
import { useSyncExternalStore } from 'react';
import { devStorybookLink } from '@/lib/report-view';

/**
 * The link into a story's dev Storybook, on the console page's own host.
 *
 * The host is read on the client: a reviewer on a tablet reaches the console at
 * the Mac's LAN address, and a link to `localhost` there is the tablet. The
 * server render, and the hydration pass that must match it, say `localhost`; the
 * page's hostname replaces it straight after. The hostname never changes under a
 * loaded page, so there is nothing to subscribe to.
 */

const subscribe = () => () => {};
const pageHost = () => window.location.hostname;
const serverHost = () => 'localhost';

export function DevStorybookLink({
  storyId,
  theme,
  className,
  ariaLabel,
  children,
}: {
  storyId: string;
  theme: string;
  className: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const host = useSyncExternalStore(subscribe, pageHost, serverHost);

  return (
    <a
      className={className}
      href={devStorybookLink(storyId, theme, host)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
    >
      {children}
    </a>
  );
}
