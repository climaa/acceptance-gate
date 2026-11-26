import path from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';

import { preset } from '../../vitest.shared.mjs';

// Content contracts for the blog: every post in content/posts compiles as MDX,
// drafts included. `next build` cannot cover drafts — see __tests__/content.test.ts.
// Run: pnpm --filter @gate/blog test  (or `turbo run test` from the root)
//
// `.mts`, not `.ts`. Vite 8 warns that this file is ESM syntax loaded as
// CommonJS and that `configLoader: 'native'`, a future default, will not load
// it at all. The extension is what makes it genuinely ESM — which is also why
// the aliases below read `import.meta.dirname` and not `__dirname`. That
// global does not exist in a module, and needing it was the reason the loader
// fell back to CommonJS to begin with, so the rename and the swap are one
// change, not two. tsconfig's `include` gained `**/*.mts` in the same commit:
// `**/*.ts` does not match `.mts`, and without it tsc stops checking this file
// while still reporting five successful tasks.
const config = defineConfig({
  // tsconfig says `jsx: preserve` because Next owns the JSX transform; oxc
  // reads that as "classic", and lib/og.tsx then throws `React is not defined`
  // the moment a test renders a card. Name the runtime Next actually uses.
  //
  // `oxc` rather than `esbuild`, and the difference is not cosmetic. Vite 8
  // moved transforms to oxc and still accepts the old `esbuild` block — but
  // only when nothing else has set `oxc`, and Vitest always sets one to pin
  // `target: node18`. So an `esbuild` block here does not read as deprecated
  // and working; it is dropped, with one yellow warning printed above the
  // stack traces and every .tsx failing to parse below them.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    // Mirrors tsconfig's "@/*": ["./*"] — app/** route handlers import lib/**
    // via this alias, and vitest doesn't read tsconfig paths on its own.
    alias: {
      '@': path.resolve(import.meta.dirname),
      // `cacheLife()` throws without the compiled `cacheComponents` config, so
      // every module declaring a cache profile would fail at import. See the
      // stub for why only that one export is provided.
      'next/cache': path.resolve(import.meta.dirname, '__tests__/stubs/next-cache.ts'),
    },
  },
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
    // No `globals` — the suite imports from 'vitest' explicitly, because
    // tsconfig's `**/*.ts` include means tsc typechecks it.
    coverage: {
      // On for the plain `vitest run`: thresholds are only evaluated when
      // coverage is enabled, so otherwise the floor would never gate `test`.
      enabled: true,
      provider: 'v8',
      // Read from disk, not from what the suite imports: v8 instruments only
      // the modules a test pulls in, so an untested module would vanish from
      // the denominator instead of counting as zero.
      include: [
        // Route handlers, pages and layouts: the code Next serves.
        'app/**/*.{ts,tsx}',
        // React components, which render posts and the index.
        'components/**/*.tsx',
        // Shared logic the routes import: content loading, OG cards, feeds.
        'lib/**/*.{ts,tsx}',
        // Client hooks the components call: Giscus threads, the synced theme.
        'hooks/**/*.ts',
        // Request-time edge code Next loads by file name, not by import.
        'proxy.ts',
        'instrumentation*.ts',
        // The build-time script that renders the Lottie still.
        'scripts/still-from-lottie.mjs',
      ],
      // Screen stories, their samples and frames: Storybook renders them and the
      // visual differ judges them, so no unit test is meant to reach one.
      exclude: ['**/*.test.{ts,tsx}', 'app/_screens/**'],
      // `text` writes to stdout only, so a run leaves no `coverage/` directory.
      reporter: ['text', 'text-summary'],
      // A FLOOR, measured rather than aspired to: 76.67 / 70.13 / 73.62 / 79.13
      // once hooks/, proxy.ts, instrumentation and scripts/ joined the include,
      // less about two points of slack. Raise it when the real number moves up;
      // never lower it to make a red run green.
      thresholds: { statements: 74, branches: 68, functions: 71, lines: 77 },
    },
  },
});

export default mergeConfig(preset, config);
