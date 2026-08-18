/** `@gate/visual-diff/commands` — see ./compare.d.ts for why these declarations
 *  exist rather than the package's own JSDoc types. */

declare module '@gate/visual-diff/commands' {
  type CaptureShot = import('@gate/visual-diff/compare').CaptureShot;

  /** What one capture run produced: the shots, and the browser build that took
   *  them. `check` passes it straight to the comparer. */
  export interface CaptureRun {
    captures: CaptureShot[];
    chromium: string;
  }

  /**
   * The package's injected-edge seam, narrowed to the one member this app
   * replaces.
   *
   * Every other edge — the filesystem, the static server, the story index, the
   * comparer, the host probe — rides through from `defaultDeps()` untouched, so
   * naming them here would be four more hand-written signatures held honest by
   * nothing. The bargain is the one ./compare.d.ts describes: declare what the
   * runner calls, and let its suite call it for real.
   */
  export interface Deps {
    capture: (run: {
      variants: readonly unknown[];
      baseUrl: string;
    }) => Promise<CaptureRun>;
  }

  /** The real modules behind every injected edge, built fresh per call. */
  export function defaultDeps(): Deps;

  /**
   * Capture the corpus under `rootDir` and compare it against the baselines
   * committed there — the differ's own `check`, composed rather than spawned.
   *
   * `rootDir` is the repo checkout this console runs inside, never its data
   * directory: `check` resolves the Storybook build and the committed baselines
   * under it. lib/runner.ts passes a `deps` whose `capture` writes the shots
   * into the data directory on the way past.
   */
  export function check(
    deps?: Deps,
    options?: { rootDir?: string; filter?: string; allowHostMismatch?: boolean },
  ): Promise<{ exitCode: number; message: string }>;
}
