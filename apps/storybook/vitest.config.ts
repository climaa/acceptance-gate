import { defineConfig, mergeConfig } from 'vitest/config';

import { preset } from '../../vitest.shared.mjs';

// Scaffold contracts for the Storybook app: the story globs, the shared React and
// Next ranges, and the build artifact's path. Node-only — stories render in real
// Chromium under the differ, never here.
// Run: pnpm --filter @gate/storybook test  (or `turbo run test` from the root)
const config = defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
    // No `globals` — the suite imports from 'vitest' explicitly, because
    // tsconfig's `__tests__` include means tsc typechecks it.
    coverage: {
      // On for the plain `vitest run`: thresholds are only evaluated when
      // coverage is enabled, so otherwise the floor would never gate anything.
      enabled: true,
      provider: 'v8',
      // Read from disk, not from what the suite imports, so a module with no
      // test counts as zero instead of vanishing from the denominator. These
      // are the app's own code: the Storybook config, preview and helpers.
      include: ['.storybook/**/*.{ts,tsx}'],
      // Explicit, so a run writes no `coverage/` directory: `text` names the
      // files when the floor breaks.
      reporter: ['text', 'text-summary'],
      // A FLOOR, two points under the 71.7 / 58.4 / 65.9 / 75.2 measured when it
      // landed. Raise it when the real number moves up; never lower it to make a
      // red run green.
      thresholds: { statements: 69, branches: 56, functions: 63, lines: 73 },
    },
  },
});

export default mergeConfig(preset, config);
