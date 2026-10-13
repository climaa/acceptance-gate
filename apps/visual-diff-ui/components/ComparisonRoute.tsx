'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  type ComparisonMode,
  comparisonHref,
  DEFAULT_MODE,
  isComparisonMode,
  parseComparisonPath,
  reportPath,
} from '@/lib/comparison';
import type { ReportSides } from '@/lib/report-view';
import type { Variant } from '@/lib/summary';
import { ComparisonModal } from './ComparisonModal';

/**
 * How the reviewer reached the comparison, which decides the one thing the two
 * ways in disagree on: where closing goes.
 *
 *  - `report` — a compare tool on the report pushed the comparison's address,
 *    and the modal slot intercepted it. The report is the history entry right
 *    behind it, so closing is `back()`, and the browser's own back button and
 *    the close button are the same gesture.
 *  - `direct` — the address was loaded cold: a shared link, a refresh. There
 *    may be nothing behind it, or another site, so closing replaces the entry
 *    with the report rather than walking out of the console.
 */
export type ComparisonEntry = 'report' | 'direct';

export interface ComparisonRouteProps {
  reportId: string;
  /** Every variant the modal can show — the report's comparable ones. */
  variants: readonly Variant[];
  sides: ReportSides;
  entry: ComparisonEntry;
}

/**
 * The comparison's address, kept in step with what the modal shows.
 *
 * Walking to another variant and switching the mode write the address with
 * `history.replaceState`, never the router: neither needs anything from the
 * server, and a router navigation would remount the dialog — dropping the
 * reviewer's focus — for every arrow press. Next mirrors a native history write
 * into `usePathname`, so a walk is still a pageview to the analytics beacon,
 * and a mode switch, which moves only the query, is not.
 *
 * Which variant and mode are showing is read back from that URL on every
 * render, never held in state. Next keeps a route it has left mounted but
 * hidden, so a closed comparison comes back with whatever state it had: a
 * modal that remembered its own key would reopen on the variant the last walk
 * ended on, under an address naming another.
 */
export function ComparisonRoute({
  reportId,
  variants,
  sides,
  entry,
}: ComparisonRouteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const asked = useSearchParams().get('mode');

  const mode: ComparisonMode = isComparisonMode(asked) ? asked : DEFAULT_MODE;

  // Off a comparison's address — closing, mid-transition — there is no modal.
  const key = parseComparisonPath(pathname)?.key ?? null;
  const variant = variants.find((candidate) => candidate.key === key);
  if (key === null || !variant) return null;

  const write = (nextKey: string, nextMode: ComparisonMode) =>
    window.history.replaceState(null, '', comparisonHref(reportId, nextKey, nextMode));

  const close = () => {
    if (entry === 'report') return router.back();
    router.replace(reportPath(reportId), { scroll: false });
  };

  return (
    <ComparisonModal
      reportId={reportId}
      variant={variant}
      variants={variants}
      sides={sides}
      mode={mode}
      onMode={(next) => write(key, next)}
      onVariant={(next) => write(next.key, mode)}
      onClose={close}
    />
  );
}
