import { defineConfig, mergeConfig } from 'vitest/config';

import { preset } from '../../vitest.shared.mjs';

const config = defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.mjs'],
    environment: 'node',
    // A FLOOR, measured rather than aspired to. The four numbers below are what
    // this suite actually covers today, less about two points of slack — they
    // exist to stop coverage falling out of the package unnoticed, not to
    // describe a target. Raise them when the real number moves up; never lower
    // them to make a red run green.
    coverage: {
      // On for the plain `vitest run`, not just `--coverage`: thresholds are
      // only evaluated when coverage is enabled, so without this the floor
      // would never run in the `test` job and would be a comment, not a gate.
      enabled: true,
      provider: 'v8',
      // Read from the filesystem, not from what the suite imports. v8
      // instruments only the modules a test pulls in, so without this the
      // denominator is "files that already have a test" and a module shipped
      // with none is invisible rather than zero.
      include: ['src/**/*.mjs'],
      // The suites themselves are not code under measurement.
      exclude: ['src/__tests__/**'],
      // Explicit, so a run writes no `coverage/` directory: `text` names the
      // files when the floor breaks, and the default reporter set would add
      // html/clover/json artifacts nothing here reads.
      reporter: ['text', 'text-summary'],
      thresholds: { statements: 90, branches: 86, functions: 91, lines: 91 },
    },
  },
});

export default mergeConfig(preset, config);
