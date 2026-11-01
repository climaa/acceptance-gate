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
 * matter read them from there: `__tests__/host.test.ts` and
 * `__tests__/docker.test.ts` pin the image against `HOST.image`, `__tests__/summary.test.ts` closes the enum
 * loop against the committed fixture, and `__tests__/runner.test.ts` puts
 * `parseVariantKey` through a real corpus.
 */

declare module '@gate/visual-diff/policy' {
  /** Atomic-design tiers, innermost first, then the app pages `screens`. */
  export type Tier = 'atoms' | 'molecules' | 'organisms' | 'templates' | 'screens';

  /** Selected via `data-theme` on `<html>` — never `prefers-color-scheme`. */
  export type Theme = 'light' | 'dark';

  export type ViewportName = 'desktop' | 'mobile';

  /** One cell of the capture matrix. `locale` only on a story listed for the
   *  locale axis; every other variant has no such field. */
  export interface Variant {
    tier: Tier;
    viewport: ViewportName;
    theme: Theme;
    locale?: string;
    id: string;
  }

  export const TIERS: readonly Tier[];
  /** Every tier but `screens`: the ones that are folders of `packages/ui/src/`. */
  export const UI_TIERS: readonly Tier[];

  /** The tier every app route tree's stories are placed in. */
  export const APP_TIER: 'screens';

  /** An app whose stories are screens — the name of its `apps/` directory. Kept
   *  in step with the policy's `APPS` by `__tests__/sections.test.ts`. */
  export type App = 'visual-diff-ui';

  /** The apps, in `APP_ROOTS`'s order: what `lib/sections.ts` splits `screens`
   *  by and `lib/comparison.ts` opens each one's screens board for. */
  export const APPS: readonly App[];

  /** The app a screen's story id names (`screens-<app>-…`), or null for an id
   *  that is not a screen's or names an app `APPS` does not have. */
  export function appOf(storyId: string): App | null;
  export const THEMES: readonly Theme[];

  /** Capture viewports, in CSS pixels at deviceScaleFactor 1. */
  export const VIEWPORTS: Readonly<
    Record<ViewportName, { width: number; height: number }>
  >;

  /** Tier → the viewports that tier is captured at. Atoms and molecules do not
   *  change shape between viewports, so they are shot at desktop only — which is
   *  why a card in either tier has no mobile rows and never could. */
  export const TIER_VIEWPORTS: Readonly<Record<Tier, readonly ViewportName[]>>;

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

  /** Applied to a story that cannot be captured deterministically. */
  export const SKIP_TAG: string;

  /** The token ledger's policy, narrowed to the names a set reader needs: the
   *  sidecar suffix a capture writes beside each shot. */
  export const LEDGER: Readonly<{ fileSuffix: string; reportDir: string }>;

  /** `${tier}__${viewport}__${theme}__${storyId}` — or, for a story listed for
   *  the locale axis, `${tier}__${viewport}__${theme}__${locale}__${storyId}` —
   *  parsed back, or `null` for a key naming a cell outside the matrix. */
  export function parseVariantKey(key: string): Variant | null;

  /** The tier a story belongs to, derived from its `importPath`. Anything outside
   *  `packages/ui/src/<tier>/` is `null` rather than a guess. */
  export function tierOf(storyPath: string): Tier | null;
}
