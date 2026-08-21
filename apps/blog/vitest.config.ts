import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Content contracts for the blog: every post in content/posts compiles as MDX,
// drafts included. `next build` cannot cover drafts — see __tests__/content.test.ts.
// Run: pnpm --filter @gate/blog test  (or `turbo run test` from the root)
export default defineConfig({
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
      '@': path.resolve(__dirname),
      // `cacheLife()` throws without the compiled `cacheComponents` config, so
      // every module declaring a cache profile would fail at import. See the
      // stub for why only that one export is provided.
      'next/cache': path.resolve(__dirname, '__tests__/stubs/next-cache.ts'),
    },
  },
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
    // No `globals` — the suite imports from 'vitest' explicitly, because
    // tsconfig's `**/*.ts` include means tsc typechecks it.
  },
});
