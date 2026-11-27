import { defineConfig, mergeConfig } from 'vitest/config';

import { preset } from '../../vitest.shared.mjs';

const config = defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      // On for the plain `vitest run`, not just `--coverage`: thresholds are only
      // evaluated when coverage is enabled, so otherwise the floor never runs.
      enabled: true,
      provider: 'v8',
      // Denominator read from the filesystem, not from what the suite imports,
      // so a module with no test counts as zero instead of vanishing.
      include: ['src/**/*.ts'],
      // The suite itself is not code under measure.
      exclude: ['src/**/*.test.ts'],
      // `text` goes to stdout; the preset adds `json`, the coverage map a run
      // leaves in `coverage/` (vitest.shared.mjs).
      reporter: ['text', 'text-summary'],
      thresholds: { lines: 98, functions: 98, branches: 98, statements: 98 },
    },
  },
});

export default mergeConfig(preset, config);
