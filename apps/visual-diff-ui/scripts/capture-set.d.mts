/**
 * `scripts/capture-set.mjs`, declared for the suite that reads it.
 *
 * Same reason as `types/visual-diff/*.d.ts`: this app sets `allowJs: false`, so a
 * `.mjs` file is outside its TypeScript program and a test importing one has
 * nothing to check the call against.
 *
 * A SIBLING declaration rather than an ambient `declare module`, which is the one
 * difference from those. An ambient block keys on the specifier string, and a
 * RELATIVE specifier resolves to a real path before it is ever matched — so the
 * block never applies and the import stays implicitly `any`. Beside the file, TS
 * reads this as that module's types by name, and the import still resolves to the
 * real `.mjs` at runtime. Still never a `paths` entry, for the reason
 * types/visual-diff/compare.d.ts sets out: a bundler reads `paths` as RESOLUTION,
 * and a module built from a declaration file exports nothing at all.
 *
 * Narrower than the file, on purpose. Only the pure halves are declared, because
 * only they are importable: everything else the script does is behind its `main()`
 * guard, and reaching for it would run a capture.
 */

/** One parsed flag: a switch, a value, or a repeated flag's values. */
type Arg = true | string | string[];

/**
 * `--flag value` pairs, `--flag` switches, and repeated flags collected.
 *
 * Returns the loose shape argv actually carries — everything is a string or a
 * boolean, and `--dirty true` lands here as the STRING `'true'`. Typing it any
 * more tightly here would be this file claiming a guarantee argv cannot make,
 * which is the shape the defect this seam now guards had.
 */
export function parseArgs(argv: readonly string[]): Record<string, Arg>;

/** Whether the capture came from a tree with uncommitted changes. Two spellings
 *  because there are two callers — see the function's own note. */
export function isDirty(value: Arg | undefined): boolean;

/** The filters `check` runs with, or undefined for the whole corpus. */
export function filtersOf(args: Record<string, Arg>): string[] | undefined;

/** The row a capture adds to `sets.json`. Returned as `unknown` on purpose: the
 *  app has a zod schema for that file (lib/summary.ts) and the suite parses what
 *  comes back, so the shape is asserted once, at runtime, by the same schema
 *  every reader of the registry goes through. */
export function buildSet(
  args: Record<string, Arg>,
  meta: { label: string; stories: number; capturedAt: string },
): unknown;
