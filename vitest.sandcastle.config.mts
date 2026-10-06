import { defineConfig } from 'vitest/config';

// Hermetic suite for the repo's own infrastructure: the orchestrator's
// contracts (prompt rules, merge-flow, model-override grammar) and the
// scripts under `scripts/`. Run: pnpm test:sandcastle
//
// `scripts/__tests__` joined the include with the visual-diff wrapper's
// tests: repo plumbing with no workspace of its own, the same kind of thing
// as the orchestrator's, and it needs a suite that CI runs.
export default defineConfig({
  test: {
    include: ['.sandcastle/__tests__/**/*.test.ts', 'scripts/__tests__/**/*.test.ts'],
    environment: 'node',
    globals: true,
  },
});
