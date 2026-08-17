/** `@gate/visual-diff/commands` — see ./compare.d.ts for why these declarations
 *  exist rather than the package's own JSDoc types. */

/**
 * Capture the corpus under `rootDir` and compare it against the baselines
 * committed there — the differ's own `check`, composed rather than spawned.
 *
 * `deps` is the package's injected-edge seam. This app passes nothing, so the
 * command takes the real filesystem, static server and browser; `rootDir` is
 * the only option it sets, and it is always derived from the data directory.
 */
export function check(
  deps?: undefined,
  options?: { rootDir?: string; filter?: string; allowHostMismatch?: boolean },
): Promise<{ exitCode: number; message: string }>;
