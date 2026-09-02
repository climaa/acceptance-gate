'use client';

import { useEffect } from 'react';

/**
 * Runs `apply` once, and again on every `[data-theme]` change.
 *
 * The attribute on the root element is what decides how this site renders —
 * never `prefers-color-scheme`, per CODING_STANDARDS — and light is the
 * attribute's ABSENCE. So the observer watches the attribute itself rather than
 * its value: add, change and remove all have to reach the callback, and a
 * listener keyed on values would miss the removal that means "back to light".
 *
 * `apply` is read through the effect on every render rather than captured once,
 * because a caller passing an inline closure would otherwise re-subscribe on
 * every render — and one that memoised it would be memoising for this hook's
 * benefit rather than its own.
 */
export function useSyncedTheme(apply: () => void): void {
  useEffect(() => {
    apply();

    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, [apply]);
}
