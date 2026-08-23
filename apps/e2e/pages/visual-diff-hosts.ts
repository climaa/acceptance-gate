import * as path from 'node:path';

/**
 * The two visual-diff worlds, one constant per world — the blog's
 * one-constant port rule, twice over.
 *
 * The suite boots one build of `@gate/visual-diff-ui` twice, each against its
 * own data directory, because the console's interesting states are trees on disk
 * and not code paths:
 *
 *   seeded    read-only. Nothing mutates it, so every read-only scenario can
 *             run against it in parallel, in both projects.
 *   sample    an EMPTY data directory, which is what a deployed instance with
 *             nothing captured looks like: the app falls back to its committed
 *             fixtures and badges itself.
 *
 * Both are read-only, and that is now the whole list: the world a job ran in —
 * wrecked by a delete and a prune — belonged to the `@mutating` project, and
 * those requirements moved to `features/local/`, where they run against your own
 * `.visual-diff` instead of a seeded copy.
 *
 * `E2E_BASE_URL` never applies to any of them: that override aims the blog
 * suite at an already-running deployment, and these three servers are booted
 * by this config with the data directories below.
 */
export const VD_HOSTS = {
  seeded: 'http://localhost:3200',
  sample: 'http://localhost:3201',
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
 * What reads it now is the accept scenario that cannot run: on a world with no
 * daemon the console degrades accept to a copyable container command, and this
 * is the image that command must name. The seed script still understands
 * `--mutating`, and `VISUAL_DIFF_FAKE_HOST_FINGERPRINT` is still the server-side
 * D3 seam, but no world this config boots declares it — the matched-host accept
 * moved to `features/local/`, where the host is your actual machine.
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
