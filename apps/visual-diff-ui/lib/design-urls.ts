import type { DesignBoard } from './comparison';

/**
 * Where a design board and its two sidecars are served (app/api/designs/route.ts).
 *
 * Its own module so a screen story can swap it whole: a static Storybook build has
 * no route to answer a query, and serves the same files at `/designs/<file>`
 * instead (apps/storybook/.storybook/design-urls.ts). Imported as
 * `@/lib/design-urls` everywhere, never relatively, because that specifier is
 * what the swap matches.
 */

/** Where a board's bytes are served. */
export const designBoardUrl = (board: DesignBoard) =>
  `/api/designs?${new URLSearchParams({ board }).toString()}`;

/** Where a board's export sidecar is served: its size in design pixels and the
 *  scale its PNG was exported at (app/api/designs/route.ts). */
export const designBoardScaleUrl = (board: DesignBoard) =>
  `/api/designs?${new URLSearchParams({ board, format: 'json' }).toString()}`;

/** Where a board's tile map is served: each variant's tile, in the board's PNG
 *  pixels. Only the tier boards have one; any other board answers 404. */
export const designBoardTilesUrl = (board: DesignBoard) =>
  `/api/designs?${new URLSearchParams({ board, format: 'tiles' }).toString()}`;
