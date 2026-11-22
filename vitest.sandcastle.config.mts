import { defineConfig, mergeConfig } from 'vitest/config';

import { preset } from './vitest.shared.mjs';

// Hermetic suite for the repo's own infrastructure: the orchestrator's
// contracts (prompt rules, merge-flow, model-override grammar) and the
// scripts under `scripts/`. Run: pnpm test:sandcastle
//
// `scripts/__tests__` joined the include with the visual-diff wrapper's
// tests: repo plumbing with no workspace of its own, the same kind of thing
// as the orchestrator's, and it needs a suite that CI runs.
const config = defineConfig({
  test: {
    include: ['.sandcastle/__tests__/**/*.test.ts', 'scripts/__tests__/**/*.test.ts'],
    environment: 'node',
    globals: true,
    coverage: {
      // On for the plain run: thresholds are only evaluated when coverage is
      // enabled, so otherwise the floor would be a comment, not a gate.
      enabled: true,
      provider: 'v8',
      // Globbed from disk, so a script with no test counts as zero instead of
      // vanishing from the denominator.
      include: ['scripts/**/*.mjs'],
      // Tests are not the code under measurement. `scripts/pen/*.js` stay out by
      // extension: they are snippets pasted into Pencil's `execute`, not Node modules.
      exclude: ['scripts/__tests__/**'],
      // Explicit, so a plain run writes no `coverage/` directory.
      reporter: ['text', 'text-summary'],
      // A FLOOR, measured rather than aspired to: what the suite covers today
      // (28.14 / 27.96 / 41.12 / 28.66) less about two points, rounded down.
      // Raise them when the real number moves up; never lower them to make a
      // red run green.
      thresholds: { statements: 26, branches: 25, functions: 39, lines: 26 },
    },
  },
});

export default mergeConfig(preset, config);
