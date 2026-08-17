/** `@gate/visual-diff/capture` — see ./compare.d.ts for why these declarations
 *  exist rather than the package's own JSDoc types. */

/**
 * A shot's pixel dimensions, read straight out of the PNG header rather than
 * off whatever produced it; `null` for anything that is not a PNG.
 */
export function pngSize(
  bytes: Uint8Array | null | undefined,
): { width: number; height: number } | null;
