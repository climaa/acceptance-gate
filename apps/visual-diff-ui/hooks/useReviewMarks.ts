'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { readReviewed, reviewStorageKey, setReviewed } from '@/lib/review-state';

/**
 * The variant keys this browser has marked reviewed, as a React value.
 *
 * `useSyncExternalStore` rather than "read storage into `useState`", because
 * the report is server-rendered and the server has no storage at all: the
 * server snapshot is empty by construction, and React re-reads the real one
 * after hydration instead of hydrating HTML that disagrees with the DOM it
 * produces. Reading storage from an effect would say the same thing with an
 * extra render and a cascading `setState`.
 *
 * The snapshot is also the render's authority, not a cache in front of storage:
 * a mark updates it first and writes second, so a browser that refuses
 * `localStorage` — private mode, site data blocked — still shows the reviewer
 * what they just did. Losing the marks on reload is the documented failure
 * (lib/review-state.ts); a checkbox that does not tick is not.
 */

function createStore(reportId: string) {
  let snapshot: ReadonlySet<string> | null = null;
  const listeners = new Set<() => void>();

  // The same Set until a mark moves: a fresh object per call would fail
  // `useSyncExternalStore`'s identity check and re-render forever.
  const getSnapshot = (): ReadonlySet<string> =>
    (snapshot ??= new Set(readReviewed(reportId)));

  const mark = (keys: readonly string[], reviewed: boolean) => {
    const next = new Set(getSnapshot());

    for (const key of keys) {
      if (reviewed) next.add(key);
      else next.delete(key);

      setReviewed(reportId, key, reviewed);
    }

    snapshot = next;
    for (const listener of listeners) listener();
  };

  /**
   * The same marks, changed in another tab.
   *
   * `storage` fires in every OTHER document on the origin, never in the one that
   * wrote — which is exactly the gap: the report and the console are two routes,
   * and a reviewer with both open marked variants in one while the accept gate
   * in the other went on counting the old number.
   *
   * That gate used to self-heal, but only by accident: `RunPanel` called
   * `readReviewed` during render, and it re-rendered on every poll, so it
   * re-read storage once a second. Removing that read is what made this listener
   * necessary — an accidental refresh is not a feature, but the freshness it
   * happened to provide was.
   *
   * `event.key === null` is the whole store being cleared, which is this report
   * too.
   */
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== reviewStorageKey(reportId)) return;

    const next = new Set(readReviewed(reportId));
    // Only when it actually moved. `useSyncExternalStore` compares snapshots by
    // identity, so handing over an equal-but-new Set would re-render every
    // consumer for a write that changed nothing of theirs.
    if (snapshot && next.size === snapshot.size && [...next].every(has(snapshot))) {
      return;
    }

    snapshot = next;
    for (const listener of listeners) listener();
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    // Bound once for the whole store rather than per consumer: two components
    // reading the same report share one listener and one re-read.
    if (listeners.size === 1) window.addEventListener('storage', onStorage);

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) window.removeEventListener('storage', onStorage);
    };
  };

  return { getSnapshot, mark, subscribe };
}

/** `set.has`, as a predicate `every` can take. */
const has =
  (set: ReadonlySet<string>) =>
  (key: string): boolean =>
    set.has(key);

/** What a server render sees, and the only honest answer it has: nobody has
 *  reviewed anything, because nobody's browser is here yet. */
const NO_MARKS: ReadonlySet<string> = new Set();

export interface ReviewMarks {
  marks: ReadonlySet<string>;
  mark: (keys: readonly string[], reviewed: boolean) => void;
}

export function useReviewMarks(reportId: string): ReviewMarks {
  const store = useMemo(() => createStore(reportId), [reportId]);
  const marks = useSyncExternalStore(store.subscribe, store.getSnapshot, () => NO_MARKS);

  return { marks, mark: store.mark };
}
