import path from 'node:path';
import { defineConfig } from 'vitest/config';

// The manual's two contracts: the Gherkin parser behaves against a fixture, and
// the published pages still match the live `.feature` sources. Both are node
// tests over data — no DOM, because every component this app renders comes from
// `@gate/ui` and is covered by that package's own suite and stories.
// Run: pnpm --filter @gate/manual test  (or `turbo run test` from the root)
//
// `.mts`, not `.ts`. The extension is what makes this genuinely ESM, which is
// why the alias below reads `import.meta.dirname` rather than `__dirname` — that
// global does not exist in a module. tsconfig's `include` carries `**/*.mts`
// for the same reason: `**/*.ts` does not match `.mts`, and without it tsc stops
// checking this file while still reporting a successful task.
export default defineConfig({
  resolve: {
    // Mirrors tsconfig's "@/*": ["./*"] — the tests import lib/** through the
    // same alias the app does, and vitest doesn't read tsconfig paths on its own.
    alias: { '@': path.resolve(import.meta.dirname) },
  },
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
    // No `globals` — the suite imports from 'vitest' explicitly, because
    // tsconfig's `**/*.ts` include means tsc typechecks it.
  },
});
