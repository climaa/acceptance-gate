import type { ThemeSegment, ViewportSegment } from './set-shots';

/**
 * The set viewer's filter, as a link carries it — `?theme=` and `?viewport=`.
 *
 * Its own module, with no runtime imports, because the half that WRITES the URL
 * runs in the browser and `set-shots.ts` reads the disk. The half that reads a
 * link, `setFilterFrom`, stays there beside the segments it checks against.
 */

/** The segment a strip opens on when the URL names none: everything. */
export const DEFAULT_SEGMENT = 'both';

/** What the set viewer is filtered to. */
export interface SetFilter {
  theme: ThemeSegment;
  viewport: ViewportSegment;
}

/** The filter as a query string, with the default left out — so an unfiltered
 *  set keeps the bare link it always had. */
export function setFilterQuery({ theme, viewport }: SetFilter): string {
  const params = new URLSearchParams();
  if (theme !== DEFAULT_SEGMENT) params.set('theme', theme);
  if (viewport !== DEFAULT_SEGMENT) params.set('viewport', viewport);

  return params.toString();
}
