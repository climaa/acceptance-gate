'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import {
  type ComparisonMode,
  comparisonHref,
  DEFAULT_MODE,
  type BoardHomes,
  type ComparisonView,
  comparisonTitle,
  DEFAULT_AGAINST,
  defaultBoard,
  type DesignBoard,
  isAgainst,
  isComparisonMode,
  isDesignBoard,
  parseComparisonPath,
  reportPath,
} from '@/lib/comparison';
import type { LedgerReport } from '@gate/visual-diff/ledger';
import type { ReportSides } from '@/lib/report-view';
import { APP_NAME } from '@/lib/site';
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
  /** What the spacing did on the variant the address names, read beside the
   *  comparison itself. Null for every comparison with no ledger report. */
  ledger: LedgerReport | null;
  entry: ComparisonEntry;
  /** The board each variant's tile is drawn on (lib/board-homes.ts). */
  homes: BoardHomes;
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
  ledger,
  entry,
  homes,
}: ComparisonRouteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const asked = params.get('mode');
  const askedAgainst = params.get('against');
  const askedBoard = params.get('board');

  const mode: ComparisonMode = isComparisonMode(asked) ? asked : DEFAULT_MODE;
  const view: ComparisonView = {
    against: isAgainst(askedAgainst) ? askedAgainst : DEFAULT_AGAINST,
    board: isDesignBoard(askedBoard) ? askedBoard : null,
  };

  // Off a comparison's address — closing, mid-transition — there is no modal.
  const key = parseComparisonPath(pathname)?.key ?? null;
  const variant = variants.find((candidate) => candidate.key === key);

  // `generateMetadata` runs on a router navigation, and a walk is not one: left
  // alone, the tab would go on naming the variant the modal opened on. Spelled
  // the way the root layout's template spells every other title.
  //
  // And the report's title is put back on the way out. Closing is a navigation
  // to a route Next still holds, so it does not re-apply that route's
  // metadata — measured: without this, the tab named the last variant walked
  // to, over the report. The report's title is its id (app/report/[id]).
  const title = variant ? `${comparisonTitle(variant)} · ${APP_NAME}` : null;
  useEffect(() => {
    if (title === null) return;

    document.title = title;
    return () => {
      document.title = `${reportId} · ${APP_NAME}`;
    };
  }, [title, reportId]);

  if (key === null || !variant) return null;

  const write = (nextKey: string, nextMode: ComparisonMode, nextView = view) =>
    window.history.replaceState(
      null,
      '',
      comparisonHref(reportId, nextKey, nextMode, nextView),
    );
  // A board equal to the one this variant opens on is not a choice worth
  // recording: the link stays bare, and walks on to a variant of another tier
  // open that tier's board.
  const pickBoard = (next: DesignBoard) =>
    write(key, mode, {
      ...view,
      board: next === defaultBoard(variant, homes) ? null : next,
    });

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
      ledger={ledger}
      against={view.against ?? DEFAULT_AGAINST}
      board={view.board ?? defaultBoard(variant, homes)}
      onMode={(next) => write(key, next)}
      onAgainst={(next) => write(key, mode, { ...view, against: next })}
      onBoard={pickBoard}
      onVariant={(next) => write(next.key, mode)}
      onClose={close}
    />
  );
}
