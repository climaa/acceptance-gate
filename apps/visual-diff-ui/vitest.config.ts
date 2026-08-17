import path from 'node:path';
import { defineConfig } from 'vitest/config';

// The data contracts for the console: the committed fixture parses against the
// schemas, the data directory resolves the way sample mode depends on, and the
// shot route refuses a path outside it.
// Run: pnpm --filter @gate/visual-diff-ui test  (or `turbo run test` from the root)
export default defineConfig({
  // tsconfig says `jsx: preserve` because Next owns the JSX transform; esbuild
  // reads that as "classic" and every rendered element then throws
  // `React is not defined`. Name the runtime Next actually uses.
  esbuild: { jsx: 'automatic' },
  resolve: {
    // Mirrors tsconfig's "@/*": ["./*"] — app/** routes import lib/** via this
    // alias, and vitest doesn't read tsconfig paths on its own.
    alias: {
      '@': path.resolve(__dirname),
      // Both stubs stand in for a compiled Next build that does not exist under
      // vitest. See each file for which exports it provides and why the rest
      // are deliberately absent.
      'next/cache': path.resolve(__dirname, '__tests__/stubs/next-cache.ts'),
      'next/server': path.resolve(__dirname, '__tests__/stubs/next-server.ts'),
      'next/navigation': path.resolve(__dirname, '__tests__/stubs/next-navigation.ts'),
    },
  },
  test: {
    // `.tsx` as well as `.ts`: the console's components render in jsdom, which
    // the one suite that needs it declares for itself with a
    // `@vitest-environment` docblock — every other suite here is real
    // filesystem work and stays in node.
    include: ['__tests__/**/*.test.{ts,tsx}'],
    environment: 'node',
    // No `globals` — the suite imports from 'vitest' explicitly, because
    // tsconfig's `**/*.ts` include means tsc typechecks it.
  },
});
