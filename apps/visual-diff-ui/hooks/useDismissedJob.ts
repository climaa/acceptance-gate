'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { readDismissed, setDismissed, DISMISS_STORAGE_KEY } from '@/lib/dismiss-state';

/**
 * The run this browser has put away, as a React value.
 *
 * `useSyncExternalStore` rather than "read storage into `useState`", for the
 * reason `useReviewMarks` states beside it: the panel is server-rendered and the
 * server has no storage at all. The server snapshot is `null` by construction,
 * and React re-reads the real one after hydration instead of hydrating HTML that
 * disagrees with the DOM it produces.
 *
 * The store is built per mount, exactly as `useReviewMarks`'s is. That is what
 * keeps `getSnapshot`'s cache from outliving the storage it caches — a module
 * singleton would answer a fresh mount with whatever the last one read.
 */

function createStore() {
  // Read lazily and then held: `useSyncExternalStore` compares snapshots by
  // identity, and re-reading storage on every call would be work on the render
  // path for an answer that only two things below can change.
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
   * Put a run away.
   *
   * The snapshot moves FIRST and storage second, so a browser that refuses
   * `localStorage` — private mode, site data blocked — still puts the card away
   * for the person who just asked. Losing that on reload is the documented
   * failure (lib/dismiss-state.ts); a button that does nothing is not.
   */
  const dismiss = (jobId: string) => {
    if (getSnapshot() === jobId) return;

    snapshot = jobId;
    setDismissed(jobId);
    notify();
  };

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
    // Bound once for the whole store rather than per consumer, as
    // `useReviewMarks` does.
    if (listeners.size === 1) window.addEventListener('storage', onStorage);

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) window.removeEventListener('storage', onStorage);
    };
  };

  return { getSnapshot, dismiss, subscribe };
}

/** What a server render sees, and the only honest answer it has: nothing is put
 *  away, because nobody's browser is here yet. */
const NOTHING_DISMISSED = null;

export interface DismissedJob {
  /** The job id this browser has put away, or null. */
  dismissed: string | null;
  dismiss: (jobId: string) => void;
}

export function useDismissedJob(): DismissedJob {
  const store = useMemo(() => createStore(), []);
  const dismissed = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => NOTHING_DISMISSED,
  );

  return { dismissed, dismiss: store.dismiss };
}
