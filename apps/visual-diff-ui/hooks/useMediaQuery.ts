'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * A media query as a React value.
 *
 * `useSyncExternalStore` rather than an effect writing state: this app is
 * server-rendered and the server has no viewport at all, so the server snapshot
 * is the caller's stated default and React re-reads the real one after
 * hydration — instead of hydrating markup that disagrees with the window it
 * lands in. It is the same shape `useReviewMarks` uses for `localStorage`, for
 * the same reason.
 *
 * The default is the caller's because the two questions asked here have
 * different safe answers: a width the server cannot know defaults to the wider
 * layout, while "does this reader want motion stopped" defaults to no. It also
 * covers a `matchMedia` that does not exist — jsdom's does not.
 */
export function useMediaQuery(query: string, fallback: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia?.(query);
      list?.addEventListener('change', onChange);

      return () => list?.removeEventListener('change', onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(
    () => window.matchMedia?.(query).matches ?? fallback,
    [query, fallback],
  );

  const getServerSnapshot = useCallback(() => fallback, [fallback]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The system's one breakpoint, as the sheet-versus-overlay question. */
export const WIDE_VIEWPORT = '(min-width: 768px)';

/** A reader who has asked the platform to stop moving things. Motion that a
 *  stylesheet drives is clamped by tokens.css; motion a timer drives has to ask
 *  this and stop itself. */
export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
