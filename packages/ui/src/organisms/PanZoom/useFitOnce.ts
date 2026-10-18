import { useEffect, useRef } from 'react';
import { fitView, type Offset, type Rect, type Size } from './geometry';

interface FitOnceInput {
  fitTo: Rect | undefined;
  natural: Size;
  pane: Size;
  cap: number;
  apply: (zoom: number, offset: Offset) => void;
}

/**
 * Opens on PanZoom's `fitTo` once the image and the pane both have a
 * size. A fit is a starting point, not a lock: it never re-applies over a zoom
 * the reader chose since.
 */
export function useFitOnce({ fitTo, natural, pane, cap, apply }: FitOnceInput) {
  const fitted = useRef(false);
  useEffect(() => {
    const ready = natural.width > 0 && pane.width > 0 && pane.height > 0;
    if (!fitTo || fitted.current || !ready) return;
    fitted.current = true;

    const { zoom, offset } = fitView(fitTo, pane, natural, cap);
    apply(zoom, offset);
  }, [fitTo, natural, pane, cap, apply]);
}
