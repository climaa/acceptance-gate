'use client';

import { useEffect, useRef, useState } from 'react';
import {
  type AddressParams,
  type OverlayParams,
  overlayQuery,
  parseOverlay,
  zoomIndexOf,
} from '@/lib/overlay-params';

/**
 * The shot view's overlay alignment, as the address carries it: read once from
 * the address it opened on, and written back as a query while the overlay is
 * the view (lib/overlay-params.ts). The alignment is a thing to point someone
 * at, unlike the panes' split and grid, which stay out of the address.
 *
 * Back beside the board, the overlay forgets its zoom: coming back, it starts
 * where the panes are then, as it did before the address held it. Until the
 * reader zooms the overlay itself, that inherited zoom is the one written, so
 * a link opens at the zoom its sender was looking at.
 */
export function useOverlayParams(
  params: AddressParams,
  overlaid: boolean,
  /** The panes' shared zoom, which the overlay starts from. */
  paneZoom: number | undefined,
): {
  params: OverlayParams;
  onParams: (next: OverlayParams) => void;
  query: string;
  /** Back to what the address says, for a view shown again (hooks/useReshow.ts). */
  reset: () => void;
} {
  const [overlay, setOverlay] = useState(() => parseOverlay(params));
  const [seen, setSeen] = useState(overlaid);
  if (seen !== overlaid) {
    setSeen(overlaid);
    if (!overlaid && overlay.zoomAt !== undefined) {
      setOverlay({ ...overlay, zoomAt: undefined });
    }
  }

  return {
    params: overlay,
    onParams: setOverlay,
    reset: () => setOverlay(parseOverlay(params)),
    query: overlayQuery(overlaid, {
      ...overlay,
      zoomAt: overlay.zoomAt ?? zoomIndexOf(paneZoom),
    }),
  };
}

/**
 * Writes the view's address whenever it changes after the first render — the
 * overlay, its alignment, the way into it. `replaceState`, as the crop is
 * written: an arrow key nudges a pixel, which is no history entry and no
 * navigation, and `useSearchParams` follows it all the same.
 */
export function useAddress(href: string) {
  const written = useRef(href);
  useEffect(() => {
    if (written.current === href) return;

    written.current = href;
    window.history.replaceState(null, '', href);
  }, [href]);
}
