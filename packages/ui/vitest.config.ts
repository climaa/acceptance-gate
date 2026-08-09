import { defineConfig } from 'vitest/config';

// Component contracts for the design system: every component in src/ asserts its
// own rendered output next to its source (src/atoms/Button/Button.test.tsx).
// The 70% coverage thresholds are a FLOOR on component logic, not a target —
// barrels and stories are excluded so they cannot inflate it. v8 measures only
// what the suite imports, so the floor guards components that have a test — a
// component with none is caught by the convention above, not by this number.
// Run: pnpm --filter @gate/ui test  (or `turbo run test` from the root)
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    // React components need a DOM; the blog's suite is node-only.
    environment: 'jsdom',
    // No `globals` — the suite imports from 'vitest' explicitly, because
    // tsconfig's `src` include means tsc typechecks it.
    coverage: {
      // On for the plain `vitest run`, not just `--coverage`: thresholds are only
      // evaluated when coverage is enabled, so without this the floor would never
      // run in the `test` CI job and would be a comment rather than a gate.
      enabled: true,
      thresholds: { lines: 70, functions: 70, branches: 70, statements: 70 },
      exclude: [
        'src/**/*.stories.tsx', // arrive in Wave 2; they are fixtures, not logic
        'src/**/index.ts', // tier barrels and the root barrel: re-exports only
        'src/**/*.test.{ts,tsx}', // the suite itself, in both flavours `include` collects
      ],
    },
  },
});
