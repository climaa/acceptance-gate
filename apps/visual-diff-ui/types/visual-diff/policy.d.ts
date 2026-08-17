/**
 * `@gate/visual-diff/policy` — see ./compare.d.ts for why these declarations
 * exist rather than the package's own JSDoc types, and for the bargain they
 * strike.
 *
 * This module WAS read from its real source, which is the better arrangement and
 * no longer a reachable one: keeping the package's `.mjs` files out of this app's
 * program is what stops `capture.mjs`, `report-html.mjs` and `static-server.mjs`
 * being typechecked under flags they were not written for (`allowJs: false` in
 * tsconfig.json), and that closes the door on all five of the package's modules
 * at once.
 *
 * Every type below is transcribed from the JSDoc annotation on the value it
 * describes, so what this app infers is what it inferred before — `z.enum(TIERS)`
 * over the `Tier` union, `keyof typeof VIEWPORTS` over the two viewport names.
 * The values themselves are the real module's at runtime, and the suites that
 * matter read them from there: `__tests__/accept-gate.test.ts` compares the
 * pinned image against `HOST.image`, `__tests__/summary.test.ts` closes the enum
 * loop against the committed fixture, and `__tests__/runner.test.ts` puts
 * `parseVariantKey` through a real corpus.
 */

declare module '@gate/visual-diff/policy' {
  /** Atomic-design tiers, innermost first. */
  export type Tier = 'atoms' | 'molecules' | 'organisms' | 'templates';

  /** Selected via `data-theme` on `<html>` — never `prefers-color-scheme`. */
  export type Theme = 'light' | 'dark';

  export type ViewportName = 'desktop' | 'mobile';

  /** One cell of the capture matrix. */
  export interface Variant {
    tier: Tier;
    viewport: ViewportName;
    theme: Theme;
    id: string;
  }

  export const TIERS: readonly Tier[];
  export const THEMES: readonly Theme[];

  /** Capture viewports, in CSS pixels at deviceScaleFactor 1. */
  export const VIEWPORTS: Readonly<
    Record<ViewportName, { width: number; height: number }>
  >;

  /** The one host baselines may be captured on, and the `BASELINE_ENV.json`
   *  fields a run has to match before its shots are comparable to them. */
  export const HOST: {
    image: string;
    comparedKeys: readonly string[];
  };

  /** Three process exit codes, and no more: unchanged, a human must look, the
   *  gate itself is broken. */
  export const EXIT: {
    ok: number;
    diff: number;
    broken: number;
  };

  /** Ceiling on the whole committed baseline set, and on one baseline in it. */
  export const BASELINE_BUDGET_BYTES: number;
  export const BASELINE_PNG_BUDGET_BYTES: number;

  /** `${tier}__${viewport}__${theme}__${storyId}` parsed back, or `null` for a
   *  key naming a cell outside the matrix. */
  export function parseVariantKey(key: string): Variant | null;
}
