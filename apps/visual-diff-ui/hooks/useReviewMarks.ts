'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { readReviewed, setReviewed } from '@/lib/review-state';

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

  const subscribe = (listener: () => void) => {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  };

  return { getSnapshot, mark, subscribe };
}

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
