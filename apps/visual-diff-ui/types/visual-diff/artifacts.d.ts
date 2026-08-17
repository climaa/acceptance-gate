/** `@gate/visual-diff/artifacts` — see ./compare.d.ts for why these
 *  declarations exist rather than the package's own JSDoc types. */

declare module '@gate/visual-diff/artifacts' {
  // The ambient module beside this one, by its specifier: a relative path would
  // name the declaration FILE, and this app resolves that specifier to the
  // package's real module at runtime.
  import type { Comparison } from '@gate/visual-diff/compare';

  /**
   * The `summary.json` object, from a run's comparison rows.
   *
   * Returns `unknown` on purpose: this app has a zod schema for that file
   * (lib/summary.ts) and parses what comes back, so the shape is asserted once, at
   * runtime, by the same schema every reader of a report goes through.
   */
  export function buildSummary(
    results: readonly Comparison[],
    env: Readonly<Record<string, string>>,
  ): unknown;
}
