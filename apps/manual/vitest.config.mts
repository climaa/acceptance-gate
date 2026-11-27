import path from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';

import { preset } from '../../vitest.shared.mjs';

// The manual's three contracts: the Gherkin parser behaves against a fixture,
// the published pages still match the live `.feature` sources, and the page-view
// beacon reports for the production deployment and nothing else. Node tests —
// a server render at most, because every component this app renders comes from
// `@gate/ui` and is covered by that package's own suite and stories. The one
// exception is `__tests__/error.test.ts`, which declares `jsdom` per file: an
// error boundary reports from an effect, and an effect needs a commit.
// Run: pnpm --filter @gate/manual test  (or `turbo run test` from the root)
//
// `.mts`, not `.ts`. The extension is what makes this genuinely ESM, which is
// why the alias below reads `import.meta.dirname` rather than `__dirname` — that
// global does not exist in a module. tsconfig's `include` carries `**/*.mts`
// for the same reason: `**/*.ts` does not match `.mts`, and without it tsc stops
// checking this file while still reporting a successful task.
const config = defineConfig({
  // tsconfig says `jsx: preserve` because Next owns the JSX transform; oxc reads
  // that as "classic", and any `.tsx` a test imports then throws `React is not
  // defined` the moment it renders. Name the runtime Next actually uses.
  //
  // `oxc` rather than `esbuild`, and the difference is not cosmetic. Vite 8
  // moved transforms to oxc and still accepts the old `esbuild` block — but only
  // when nothing else has set `oxc`, and Vitest always sets one to pin a target.
  // So an `esbuild` block here would not read as deprecated and working; it is
  // dropped, with one yellow warning above the stack traces and every `.tsx`
  // failing to parse below them.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    // Mirrors tsconfig's "@/*": ["./*"] — the tests import lib/** through the
    // same alias the app does, and vitest doesn't read tsconfig paths on its own.
    alias: {
      '@': path.resolve(import.meta.dirname),
      // `cacheLife()` throws without the compiled `cacheComponents` config, so
      // lib/og.tsx would fail at import. See the stub for why only that one
      // export is provided.
      'next/cache': path.resolve(import.meta.dirname, '__tests__/stubs/next-cache.ts'),
    },
  },
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
    // No `globals` — the suite imports from 'vitest' explicitly, because
    // tsconfig's `**/*.ts` include means tsc typechecks it.

    // A FLOOR, measured rather than aspired to: what the suite covered when it
    // was installed, less about two points, rounded down.
    coverage: {
      // On for the plain `vitest run`: thresholds are only evaluated when
      // coverage is enabled — the same reason apps/visual-diff-ui gives.
      enabled: true,
      provider: 'v8',
      // Read from the filesystem, not from what the suite imports, so a module
      // with no test counts as zero instead of being invisible. `app/` holds the
      // routes, layouts and metadata files; `components/` the screens they
      // compose; `lib/` the parser, allowlist and helpers; `content/` the tour,
      // intro and screenshot data the pages render; `proxy.ts` the request
      // proxy Next runs ahead of every route.
      include: [
        'app/**/*.{ts,tsx}',
        'components/**/*.tsx',
        'content/**/*.{ts,tsx}',
        'lib/**/*.{ts,tsx}',
        'proxy.ts',
      ],
      // Screen stories, their samples and frames: Storybook renders them and the
      // visual differ judges them, so no unit test is meant to reach one.
      exclude: ['app/_screens/**'],
      // Explicit stdout reporters; the preset adds `json`, the coverage map a
      // run leaves in `coverage/` (vitest.shared.mjs).
      reporter: ['text', 'text-summary'],
      // Measured at 90.05 / 89.36 / 85.24 / 90.24 once `content/` and `proxy.ts`
      // joined the include. Raise them when the real number moves up; never
      // lower them to make a red run green.
      thresholds: { statements: 88, branches: 87, functions: 83, lines: 88 },
    },
  },
});

export default mergeConfig(preset, config);
