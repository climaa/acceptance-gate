// @ts-check
//
// The preset every vitest config in this repository extends, with
// `mergeConfig(preset, defineConfig({ … }))`. It holds the two things every
// suite shares: how long a test and a hook may wait, and the coverage map a
// run leaves behind.
//
// Vitest's defaults are 5 s per test and 10 s per hook. Alone, every suite here
// passes well inside them. The gate's `test` check runs every workspace's suite
// at once, beside the gate's own builds, and a file's first test pays its cold
// start under that load (ESLint and its parser, a jsdom environment, the Next
// transform, a git repository): the same tests then pass the defaults and a
// correct tree is refused. 20 s is the value the child projects reached one
// workspace at a time, for tests and hooks alike. The wait is not the fix for
// the load; the gate's bounded test concurrency is (scripts/gate/manifest.mjs).
//
// A workspace may raise either value, never lower it:
// `scripts/vitest-timeout-scan.mjs` in `health:check` refuses a config below
// `TIMEOUT_FLOOR_MS`, or one that does not import this file.
import { defineConfig } from 'vitest/config';

/** Twenty seconds: the floor for `testTimeout` and `hookTimeout` alike. */
export const TIMEOUT_FLOOR_MS = 20_000;

// Every suite with coverage on writes `coverage/coverage-final.json`, the
// per-function map fallow's `--coverage` reads to score CRAP. Vite's
// `mergeConfig` concatenates arrays, so this `json` joins a config's own
// `['text', 'text-summary']` rather than replacing it; `coverage/` is
// git-ignored, and turbo's `test` task keeps the map as its output, so a cache
// hit restores it. A command-line `--coverage.reporter` (census's measure run)
// replaces the merged list outright. Owner ruling, 26 Nov 2026: the `json`
// reporter and the directory it writes are allowed; no `include` or
// `thresholds` changes with it.
export const preset = defineConfig({
  test: {
    testTimeout: TIMEOUT_FLOOR_MS,
    hookTimeout: TIMEOUT_FLOOR_MS,
    coverage: { reporter: ['json'] },
  },
});
