'use client';

import { useSyncExternalStore } from 'react';
import { DISMISS_STORAGE_KEY, readDismissed, setDismissed } from '@/lib/dismiss-state';

/**
 * The run this browser has put away, as a React value.
 *
 * `useSyncExternalStore` rather than "read storage into `useState`", for the
 * reason `useReviewMarks` states beside it: the panel is server-rendered and the
 * server has no storage at all. The server snapshot is `null` by construction,
 * and React re-reads the real one after hydration instead of hydrating HTML that
 * disagrees with the DOM it produces.
 *
 * Where it parts company with `useReviewMarks` is that ONE store serves the
 * whole document rather than one per mount. Two components read this at once —
 * the region that draws the run, and the run panel whose start button puts it
 * away — and a store per consumer is two snapshots that never hear about each
 * other: the panel dismissed a job and the region went on drawing it, because
 * the notification never left the panel's own copy. `useReviewMarks` gets away
 * with a store per mount only because its two readers are two ROUTES, and the
 * `storage` event it leans on carries between documents.
 */

function createStore() {
  // Read lazily and then held: `useSyncExternalStore` compares snapshots by
  // identity, and re-reading storage on every call would be work on the render
  // path for an answer that only the writers below can change.
  //
  // `undefined` is the not-yet-read sentinel and `null` is a real answer, so the
  // test below is against `undefined` and not `??=`. That operator fires on
  // null too, which would leave the commonest snapshot of all — nothing
  // dismissed — re-read on every call: an uncached `getSnapshot`, and a
  // cross-tab write that `onStorage` then sees as no change at all.
  let snapshot: string | null | undefined;
  const listeners = new Set<() => void>();

  const getSnapshot = (): string | null => {
    if (snapshot === undefined) snapshot = readDismissed();

    return snapshot;
  };

  const notify = () => {
    for (const listener of listeners) listener();
  };

  /**
   * The one place this writes.
   *
   * The snapshot moves FIRST and storage second, so a browser that refuses
   * `localStorage` — private mode, site data blocked — still puts the card away
   * for the person who just asked. Losing that on reload is the documented
   * failure (lib/dismiss-state.ts); a button that does nothing is not.
   */
  const set = (next: string | null) => {
    if (getSnapshot() === next) return;

    snapshot = next;
    setDismissed(next);
    notify();
  };

  /** Put a run away. */
  const dismiss = (jobId: string) => set(jobId);

  /**
   * Put the dismissal back to what it was.
   *
   * For the start button, which clears the card on the click rather than on the
   * server's answer — the POST it is waiting for runs a synchronous `docker
   * info` first, and the card would otherwise go on showing the last run's
   * verdict throughout. A refused start owes that run back.
   */
  const restore = (previous: string | null) => set(previous);

  /**
   * The same key, written by another tab.
   *
   * `storage` fires in every OTHER document on the origin, never in the one that
   * wrote — which is the gap worth closing here: two console tabs both poll this
   * panel once a second, and without this one of them goes on showing a run the
   * other put away. `event.key === null` is the whole store being cleared, which
   * is this key too.
   */
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== DISMISS_STORAGE_KEY) return;

    const next = readDismissed();
    if (next === getSnapshot()) return;

    snapshot = next;
    notify();
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    if (listeners.size === 1) {
      // Nothing was watching until now, so nothing was keeping the cache honest
      // — `onStorage` was unbound, and a write from anywhere else went unseen.
      // Dropped rather than re-read here: React calls `getSnapshot` again right
      // after subscribing precisely to catch a change that landed in this gap.
      snapshot = undefined;
      // Bound once for the whole store rather than per consumer.
      window.addEventListener('storage', onStorage);
    }

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) window.removeEventListener('storage', onStorage);
    };
  };

  return { getSnapshot, dismiss, restore, subscribe };
}

/** One per document — see the header. Building it at module scope costs
 *  nothing: it reads no storage until something asks for a snapshot. */
const store = createStore();

/** What a server render sees, and the only honest answer it has: nothing is put
 *  away, because nobody's browser is here yet. */
const NOTHING_DISMISSED = null;

export interface DismissedJob {
  /** The job id this browser has put away, or null. */
  dismissed: string | null;
  dismiss: (jobId: string) => void;
  /** What an optimistic `dismiss` is undone with — see the store. */
  restore: (previous: string | null) => void;
}

export function useDismissedJob(): DismissedJob {
  const dismissed = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => NOTHING_DISMISSED,
  );

  return { dismissed, dismiss: store.dismiss, restore: store.restore };
}
