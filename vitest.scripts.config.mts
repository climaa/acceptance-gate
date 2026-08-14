import { defineConfig } from 'vitest/config';

// `turbo run test` reaches workspaces, and scripts/ is not one. Run: pnpm test:scripts
//
// No `globals: true`, unlike vitest.sandcastle.config.mts: these specs are linted
// by eslint.config.mjs alongside the scripts they cover, and an ambient describe/it
// would be a `no-undef` there. Importing them from 'vitest' costs one line and keeps
// the lint config free of a test-only globals exception.
export default defineConfig({
  test: {
    include: ['scripts/__tests__/**/*.test.mjs'],
    environment: 'node',
  },
});
