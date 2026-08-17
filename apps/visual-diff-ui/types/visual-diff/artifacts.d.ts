/** `@gate/visual-diff/artifacts` — see ./compare.d.ts for why these
 *  declarations exist rather than the package's own JSDoc types. */

import type { Comparison } from './compare';

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
