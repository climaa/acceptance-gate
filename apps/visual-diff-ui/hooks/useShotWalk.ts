'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import {
  type AddressParams,
  asksOverlay,
  ORIGIN,
  overlayQuery,
  parseOverlay,
} from '@/lib/overlay-params';
import { shotViewHref } from '@/lib/shots';
import { typedInField } from './useShotTools';

/** ⌥/Alt with an arrow, never Ctrl: macOS takes Ctrl+←/→ to switch Spaces. */
const WALK_KEYS: Readonly<Record<string, -1 | 1>> = { ArrowLeft: -1, ArrowRight: 1 };

/**
 * Where a walk to another shot of the set lands. The way of looking travels —
 * the overlay, its blend, opacity and zoom — and what belongs to one tile does
 * not: both nudges, the crop and the board, which falls back to the one the
 * next shot's tier lives on.
 */
export function walkHref(label: string, key: string, params: AddressParams): string {
  const overlay = overlayQuery(asksOverlay(params), {
    ...parseOverlay(params),
    board: ORIGIN,
    shot: ORIGIN,
  });

  return shotViewHref(label, key, null, null, overlay);
}

/**
 * ⌥/Alt + ←/→ to the shot before or after this one, in the set page's order.
 *
 * A router navigation, not the `replaceState` the view's own address uses:
 * another shot needs its own ledger and homes from the server. `replace`, so
 * the history keeps its depth — the modal's close is `back()`, and it still
 * lands on the set however far the reader walked. A soft navigation is
 * intercepted again, so the modal stays a modal. Both ends are prefetched so a
 * press lands at once.
 */
export function useShotWalk(
  label: string,
  params: AddressParams,
  prevKey: string | undefined,
  nextKey: string | undefined,
): void {
  const router = useRouter();
  const prev = prevKey ? walkHref(label, prevKey, params) : null;
  const next = nextKey ? walkHref(label, nextKey, params) : null;
  // Read through a ref so the listener is bound once and still walks to where
  // the address points now, nudges and blend included.
  const latest = useRef({ prev, next });

  useEffect(() => {
    latest.current = { prev, next };
    if (prev) router.prefetch(prev);
    if (next) router.prefetch(next);
  }, [router, prev, next]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const step = WALK_KEYS[event.key];
      if (!step || !event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.defaultPrevented || typedInField(event)) return;
      const to = step < 0 ? latest.current.prev : latest.current.next;
      // Claimed even at an end, so Alt+← never falls through to "back".
      event.preventDefault();
      if (to) router.replace(to, { scroll: false });
    };
    document.addEventListener('keydown', onKey);

    return () => document.removeEventListener('keydown', onKey);
  }, [router]);
}
