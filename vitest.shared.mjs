// @ts-check
//
// The preset every vitest config in this repository extends, with
// `mergeConfig(preset, defineConfig({ … }))`. It holds the one thing every suite
// shares: how long a test and a hook may wait.
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

export const preset = defineConfig({
  test: { testTimeout: TIMEOUT_FLOOR_MS, hookTimeout: TIMEOUT_FLOOR_MS },
});
