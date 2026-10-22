/**
 * `scripts/baselines-stamp.mjs`, declared for the suite that reads it — a sibling
 * declaration for the reason scripts/capture-set.d.mts sets out.
 */

/** `<short sha> <YYYY-MM-DD>` from `git log`'s `%H`, `%h`, `%ad` lines, or `''`
 *  when the log is empty or names a shallow clone's boundary. */
export function stampFrom(log: string, boundaries: readonly string[]): string;

/** The stamp for the checkout at `root`, or `''` when git cannot say. */
export function baselinesStamp(root: string): string;
