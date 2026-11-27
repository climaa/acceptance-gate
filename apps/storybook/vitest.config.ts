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
      // are the app's own code: the Storybook config, preview and helpers, and
      // the docs pages' own components and data under src/docs.
      include: ['.storybook/**/*.{ts,tsx}', 'src/docs/**/*.{ts,tsx}'],
      // Explicit: `text` names the files when the floor breaks. The preset adds
      // `json`, the coverage map a run leaves in `coverage/` (vitest.shared.mjs).
      reporter: ['text', 'text-summary'],
      // A FLOOR, two points under the 72.0 / 60.0 / 66.1 / 75.0 measured when the
      // include last widened. Raise it when the real number moves up; never lower
      // it to make a red run green.
      thresholds: { statements: 70, branches: 58, functions: 64, lines: 73 },
    },
  },
});

export default mergeConfig(preset, config);
