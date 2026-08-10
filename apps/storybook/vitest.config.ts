import { defineConfig } from 'vitest/config';

// Scaffold contracts for the Storybook app: the story globs, the shared React and
// Next ranges, and the build artifact's path. Node-only — stories render in real
// Chromium under the differ, never here.
// Run: pnpm --filter @gate/storybook test  (or `turbo run test` from the root)
export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
    // No `globals` — the suite imports from 'vitest' explicitly, because
    // tsconfig's `__tests__` include means tsc typechecks it.
  },
});
