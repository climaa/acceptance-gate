import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Content contracts for the blog: every post in content/posts compiles as MDX,
// drafts included. `next build` cannot cover drafts — see __tests__/content.test.ts.
// Run: pnpm --filter @gate/blog test  (or `turbo run test` from the root)
export default defineConfig({
  resolve: {
    // Mirrors tsconfig's "@/*": ["./*"] — app/** route handlers import lib/**
    // via this alias, and vitest doesn't read tsconfig paths on its own.
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
    // No `globals` — the suite imports from 'vitest' explicitly, because
    // tsconfig's `**/*.ts` include means tsc typechecks it.
  },
});
