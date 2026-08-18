/**
 * `@gate/visual-diff/compare`, declared for this app rather than inferred from
 * its source. The three files beside this one do the same for the package's
 * other modules.
 *
 * AMBIENT, never a `paths` entry. A `paths` mapping onto these files is what the
 * app shipped first, and it broke every job in a production build: Turbopack
 * reads `tsconfig.json`'s `paths` as RESOLUTION, so `compareAll`, `pngSize`,
 * `buildSummary` and `check` were bundled from a declaration file — which has no
 * runtime exports — and a compare died with `(void 0) is not a function` after
 * its first log line. Under `declare module` TypeScript reads these and the
 * bundler never sees them, so the types are this app's and the code is the
 * package's. `__tests__/config.test.ts` holds that split in place.
 *
 * WHY. The package is JavaScript with JSDoc, every module carries `// @ts-check`,
 * and the package has no tsconfig of its own — so it is checked with whatever
 * flags its consumer brings. This app's include `noUncheckedIndexedAccess` (via
 * `@gate/tsconfig`), under which `capture.mjs`, `report-html.mjs` and
 * `static-server.mjs` report eight "possibly undefined" index reads that are
 * clean under the flags the package was written with. `compare.mjs` reaches
 * `capture.mjs` through a JSDoc typedef, so importing the comparer for its types
 * fails this app's typecheck on another workspace's files — and editing that
 * workspace is exactly what this issue may not do beyond its `exports` map.
 *
 * WHAT IT COSTS. These are hand-written, so they can drift from the functions
 * they describe. Two things hold them honest: they name only the members the
 * runner calls, and `__tests__/runner.test.ts` calls every one of them for real
 * against the committed fixture — a changed signature fails that suite rather
 * than passing quietly. It is the same bargain lib/summary.ts already takes with
 * `summary.json`, one layer down.
 *
 * `@gate/visual-diff/policy` is deliberately NOT declared here: it is
 * zero-import, side-effect free and clean under these flags, so its real types
 * are the ones this app reads.
 */

declare module '@gate/visual-diff/compare' {
  /**
   * One captured cell of the matrix, as the comparer reads it. `captured` is the
   * neutral bucket — whether a shot is unchanged, changed or new is the
   * comparer's verdict, not its reader's.
   */
  export interface CaptureShot {
    key: string;
    id: string;
    tier: string;
    viewport: string;
    theme: string;
    bucket: 'captured' | 'errored' | 'a11y';
    bytes: Uint8Array | null;
    width: number | null;
    height: number | null;
    violations: { id: string; nodes: number }[];
    error: string | null;
  }

  /**
   * One row of a comparison. Only the fields this app reads itself are named;
   * everything else rides through to `buildSummary`, which is what turns a row
   * into the `summary.json` shape lib/summary.ts validates.
   */
  export interface Comparison {
    key: string;
    bucket: string;
    /** The diff PNG, produced only for a failing pair. */
    diff: Uint8Array | null;
  }

  /** Compare a whole set of shots against the baselines they are keyed against. */
  export function compareAll(run: {
    captures: readonly CaptureShot[];
    baselines: ReadonlyMap<string, Uint8Array>;
    env?: Record<string, string | undefined>;
  }): Comparison[];
}
