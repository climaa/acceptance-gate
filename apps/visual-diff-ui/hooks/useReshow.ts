'use client';

import { useEffectEvent, useLayoutEffect, useRef } from 'react';

/**
 * Runs `onReshow` each time a route Next kept mounted but hidden is shown
 * again — never on the first show.
 *
 * Next 16 keeps a route it has left mounted and hidden, and React re-creates
 * its effects, not its state, when it comes back. A closed shot view reopened
 * on a bare address would otherwise come back as it was left, under an address
 * naming none of it. Strict Mode's second mount in development counts as a
 * reshow; it reads the address the view just opened on, so it changes nothing.
 *
 * A layout effect, as Next's own guide resets a hidden route's state
 * (preserving-ui-state.md): it runs before the reshown view paints, so no
 * frame shows the state it was left with.
 */
export function useReshow(onReshow: () => void) {
  const shown = useRef(false);
  const reshow = useEffectEvent(onReshow);
  useLayoutEffect(() => {
    if (shown.current) reshow();
    shown.current = true;
  }, []);
}
