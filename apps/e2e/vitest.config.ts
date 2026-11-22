import { defineConfig, mergeConfig } from 'vitest/config';

import { preset } from '../../vitest.shared.mjs';

// Unit tests for the suite's own support code. The scenarios themselves run
// under Playwright, never here — `include` names `__tests__/` alone so vitest can
// never pick up a step file or a generated spec.
const config = defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
    // A FLOOR, measured rather than aspired to: what this suite covers today,
    // less about two points of slack. Raise it when the real number moves up;
    // never lower it to make a red run green.
    coverage: {
      // On for the plain `vitest run`, not just `--coverage`: thresholds are only
      // evaluated when coverage is enabled, so without this the floor would be a
      // comment rather than a gate.
      enabled: true,
      provider: 'v8',
      // Read from the filesystem, not from what the suite imports, so a module
      // with no test counts as zero instead of vanishing from the denominator.
      // Only these two are this suite's subject: step definitions and page
      // objects run under Playwright, and the acceptance suite exercises them.
      include: [
        // The integrity checks `check:suite` / `check:local` run, and the
        // visual-diff seed the Playwright config hands its data directory to.
        'scripts/**/*.mjs',
        // The suite's own support code (the analytics guard).
        'support/**/*.ts',
      ],
      // Explicit, so a run writes no `coverage/` directory: `text` names the
      // files when the floor breaks, and the default set would add artifacts
      // nothing here reads.
      reporter: ['text', 'text-summary'],
      thresholds: { statements: 2, branches: 3, functions: 4, lines: 2 },
    },
  },
});

export default mergeConfig(preset, config);
