import { defineConfig, mergeConfig } from 'vitest/config';

import { preset } from '../../vitest.shared.mjs';

const config = defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // A FLOOR, measured rather than aspired to: each number is what the suite
    // covers today less about two points, rounded down. Raise them when the real
    // number moves up; never lower them to make a red run green.
    coverage: {
      // On for the plain `vitest run`, not just `--coverage`: thresholds are only
      // evaluated when coverage is enabled, so otherwise the floor would be a
      // comment rather than a gate.
      enabled: true,
      provider: 'v8',
      // Read from the filesystem, not from what the suite imports, so a module
      // shipped with no test counts as zero instead of vanishing.
      include: ['src/**/*.ts'],
      // The suite itself, which `include` would otherwise collect.
      exclude: ['src/**/*.test.ts'],
      // Explicit, so a run writes no `coverage/` directory: `text` goes to stdout.
      reporter: ['text', 'text-summary'],
      thresholds: { statements: 96, branches: 94, functions: 98, lines: 96 },
    },
  },
});

export default mergeConfig(preset, config);
