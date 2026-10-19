'use client';

import { optOutBeforeSend } from '@gate/logger/analytics';
import { Analytics } from '@vercel/analytics/next';

/**
 * The page-view beacon, with the owner's opt-out attached.
 *
 * A client module only because of `beforeSend`: the layout is a server
 * component, and a function cannot cross into a client one as a prop. The
 * production gate stays in the layout, where it is decided at prerender.
 *
 * Open any page with `?va-disable=1` once per browser to stop counting your own
 * visits on this origin, `?va-disable=0` to start again — see
 * `@gate/logger/analytics`.
 */
export function SiteAnalytics() {
  return <Analytics beforeSend={optOutBeforeSend} />;
}
