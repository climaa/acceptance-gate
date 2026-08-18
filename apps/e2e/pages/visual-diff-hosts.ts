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
 * The absolute path one world's server reads as `VISUAL_DIFF_DATA_DIR`.
 *
 * Absolute because the app is started with its own workspace as the working
 * directory: a relative value would resolve under `apps/visual-diff-ui` and
 * find nothing, which the console would report as sample mode rather than as
 * an error.
 */
export const vdWorldDir = (world: VdWorld): string => path.join(VD_WORLDS_DIR, world);
