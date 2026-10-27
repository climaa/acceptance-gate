/**
 * `@/lib/design-urls` as a static build serves it: the board files themselves,
 * from the `/designs` static directory beside the page, where the console asks a
 * route with a query (`/api/designs?board=…`) that no static server can answer.
 * The same bytes either way — `designs/exports/` is what that route reads.
 *
 * `string` rather than the console's `DesignBoard`: this workspace's typecheck
 * has no `@/`, and the alias only has to answer the console's own calls.
 */

export const designBoardUrl = (board: string) => `/designs/${board}.png`;

export const designBoardScaleUrl = (board: string) => `/designs/${board}.json`;

export const designBoardTilesUrl = (board: string) => `/designs/${board}.tiles.json`;
