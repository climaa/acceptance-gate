import path from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';

import { preset } from '../../vitest.shared.mjs';

// census's contracts: the measurement and history schemas refuse a malformed
// file and name every failing path; each gap rule yields its kind and only its
// kind; the feature → app map covers every `.feature` the acceptance suite has;
// the site card is the PNG crawlers crop against, and the page-view beacon
// reports for the production deployment and nothing else.
// All pure node tests over fixtures — `lib/` reads no disk and spawns nothing.
// Run: pnpm --filter @gate/census test  (or `turbo run test` from the root)
//
// `.mts`, not `.ts` — see apps/blog/vitest.config.mts for why the extension
// and `import.meta.dirname` are one change rather than two.
const config = defineConfig({
  // The site card and the layout are `.tsx`. tsconfig says `jsx: preserve`
  // because Next owns the JSX transform, so name the runtime Next actually uses
  // — apps/manual/vitest.config.mts records why this is `oxc`, not `esbuild`.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    // Mirrors tsconfig's "@/*": ["./*"]; vitest doesn't read tsconfig paths.
    alias: {
      '@': path.resolve(import.meta.dirname),
      // `cacheLife()` throws without the compiled `cacheComponents` config, so
      // lib/og.tsx would fail at import. See the stub.
      'next/cache': path.resolve(import.meta.dirname, '__tests__/stubs/next-cache.ts'),
    },
  },
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
    // No `globals` — the suite imports from 'vitest' explicitly, because
    // tsconfig's `**/*.ts` include means tsc typechecks it.
    // A FLOOR from day one, measured rather than aspired to: what the suite
    // covered when it landed, less about two points. A census that left its
    // own code unmeasured would be the first gap on its own page.
    coverage: {
      // On for the plain `vitest run`: thresholds are only evaluated when
      // coverage is enabled. The reason apps/visual-diff-ui gives for its own.
      enabled: true,
      // Read from the filesystem, not from what the suite imports, so a module
      // with no test counts as zero instead of being invisible. The shape of
      // apps/visual-diff-ui/vitest.config.mts: every route, component and the
      // measuring script, not just `lib/` — owner ruling QA-02 (pyramid track
      // A, 26 Nov 2026). Under `lib/**/*.ts` alone 33 files sat outside the
      // denominator and census reported itself near 100 %.
      include: [
        'app/**/*.{ts,tsx}',
        'components/**/*.tsx',
        'lib/**/*.{ts,tsx}',
        'scripts/measure.mjs',
      ],
      // Screen stories, their samples and frames stay out: Storybook renders
      // them and the visual differ judges them, so no unit test is meant to
      // reach one. The reason apps/visual-diff-ui gives for its own.
      exclude: ['**/*.test.{ts,tsx}', 'app/_screens/**'],
      // Explicit, so a run writes no `coverage/` directory.
      reporter: ['text', 'text-summary'],
      // Measured at 75.68 / 76.49 / 79.05 / 75.03 when the include widened to
      // app/, components/ and scripts/ (QA-02). Was 98 / 96 / 98 / 98 over
      // `lib/**/*.ts` alone (measured there at 99.65 / 97.36 / 99.8 / 99.89).
      // The fall is the denominator growing by the owner's ruling, not the
      // suite covering less: every zero-measured file is an `uncovered-file`
      // gap on census's own page, and each is its own issue. Raise them when
      // the real number moves up; never lower them to make a red run green.
      thresholds: { statements: 73, branches: 74, functions: 77, lines: 73 },
    },
  },
});

export default mergeConfig(preset, config);
