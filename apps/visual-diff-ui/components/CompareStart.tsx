'use client';

import {
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useRef,
} from 'react';

/**
 * The pickers' press, carried to the run panel that starts it.
 *
 * `compare A ⇄ B` does two things. It pre-fills the run panel through the URL —
 * `?a&b&mode&cn`, the seam ComparePickers.tsx describes — and, on a console that
 * can start jobs, it starts the comparison. The second half must NOT ride the
 * URL: a reload or a shared link replays the query string, and a link that
 * starts a job on whoever opens it is a mutation on GET. So the start travels
 * here, in memory, from the click that asked for it, and is gone with the tab.
 *
 * The run panel registers how it starts a job rather than the pickers posting
 * one themselves: the refusal, the disabled button and D1's running alert all
 * belong to the panel, and a second start path would draw them somewhere else.
 *
 * A ref, not state: nothing renders differently because a handler exists, so
 * registering one must not re-render the console. Before the panel registers —
 * or on a console that has none — a press only pre-fills, which is what it did
 * before the start was added. Outside a provider both hooks do nothing: the
 * default is null rather than a ref, because a default ref would be one object
 * shared by every tree that forgot the provider.
 */

/** The pair a press asks to compare, in the run panel's own vocabulary. */
export interface ComparePair {
  baseline: string;
  candidate: string;
}

type StartCompare = (pair: ComparePair) => void;

const CompareStartContext = createContext<RefObject<StartCompare | null> | null>(null);

export function CompareStartProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<StartCompare | null>(null);

  return (
    <CompareStartContext.Provider value={handlerRef}>
      {children}
    </CompareStartContext.Provider>
  );
}

/** Start the comparison for this pair, if a run panel is listening. */
export function useCompareStart(): StartCompare {
  const handlerRef = useContext(CompareStartContext);

  return (pair) => handlerRef?.current?.(pair);
}

/** The run panel's half: how a press is started. Re-registered every render, so
 *  the press always reaches the panel's current closure rather than its first. */
export function useHandleCompareStart(start: StartCompare): void {
  const handlerRef = useContext(CompareStartContext);

  useEffect(() => {
    if (handlerRef === null) return;
    handlerRef.current = start;

    return () => {
      handlerRef.current = null;
    };
  });
}
