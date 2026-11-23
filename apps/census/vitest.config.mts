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
      // with no test counts as zero instead of being invisible.
      include: ['lib/**/*.ts'],
      // Explicit, so a run writes no `coverage/` directory.
      reporter: ['text', 'text-summary'],
      // Measured at 100 / 98.1 / 100 / 100 when lib/ landed. Raise them when the
      // real number moves up; never lower them to make a red run green.
      thresholds: { statements: 98, branches: 96, functions: 98, lines: 98 },
    },
  },
});

export default mergeConfig(preset, config);
