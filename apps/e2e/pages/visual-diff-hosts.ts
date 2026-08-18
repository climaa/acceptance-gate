import * as path from 'node:path';

/**
 * The three visual-diff worlds, one constant per world — the blog's
 * one-constant port rule, three times over.
 *
 * The suite boots one build of `@gate/visual-diff-ui` three times, each against
 * its own data directory, because the console's three interesting states are
 * three trees on disk and not three code paths:
 *
 *   seeded    read-only. Nothing mutates it, so every read-only scenario can
 *             run against it in parallel, in both projects.
 *   sample    an EMPTY data directory, which is what a deployed instance with
 *             nothing captured looks like: the app falls back to its committed
 *             fixtures and badges itself.
 *   mutating  the `@mutating` project's own world, serial, and its to wreck —
 *             a job runs in it, a set is deleted from it, the rest are pruned.
 *
 * `E2E_BASE_URL` never applies to any of them: that override aims the blog
 * suite at an already-running deployment, and these three servers are booted
 * by this config with the data directories below.
 */
export const VD_HOSTS = {
  seeded: 'http://localhost:3200',
  sample: 'http://localhost:3201',
  mutating: 'http://localhost:3202',
} as const;

export type VdWorld = keyof typeof VD_HOSTS;

/** Where each world's tree is created, before its server boots. Gitignored, and
 *  wiped by `scripts/seed-visual-diff.mjs` on every boot — a world that survived
 *  the last run is a world the last run may have wrecked. */
export const VD_WORLDS_DIR = path.join(import.meta.dirname, '..', '.worlds');

/**
 * The pinned capture container, transcribed from
 * `packages/visual-diff/src/policy.mjs`'s `HOST.image` — the same value the
 * `@playwright/test` pin is bumped with. Restated rather than imported: that
 * module is a `.mjs` this workspace's `tsconfig` cannot type (`allowJs: false`,
 * no declarations), and the seed script — a `.mjs` itself — does import it.
 *
 * Written once for both readers of it. `playwright.config.ts` hands it to the
 * mutating world's server as `VISUAL_DIFF_FAKE_HOST_FINGERPRINT`, which is the
 * whole D3 seam: the app reads it server-side and reports it from
 * `GET /api/env`, so a scenario drives the accept gate's decision from one
 * variable and the client cannot disagree with the server about what host it is
 * on. The accept steps read the same constant back off the screen. Inert for
 * every scenario except the matched-host accept (#285).
 */
export const VD_PINNED_IMAGE = 'mcr.microsoft.com/playwright:v1.62.1-noble';

/**
 * The absolute path one world's server reads as `VISUAL_DIFF_DATA_DIR`.
 *
 * Absolute because the app is started with its own workspace as the working
 * directory: a relative value would resolve under `apps/visual-diff-ui` and
 * find nothing, which the console would report as sample mode rather than as
 * an error.
 */
export const vdWorldDir = (world: VdWorld): string => path.join(VD_WORLDS_DIR, world);
