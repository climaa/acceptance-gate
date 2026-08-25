import path from 'node:path';
import { defineConfig } from 'vitest/config';

// The data contracts for the console: the committed fixture parses against the
// schemas, the data directory resolves the way sample mode depends on, and the
// shot route refuses a path outside it.
// Run: pnpm --filter @gate/visual-diff-ui test  (or `turbo run test` from the root)
//
// `.mts`, not `.ts` — see apps/blog/vitest.config.mts for why the extension
// and `import.meta.dirname` are one change rather than two.
export default defineConfig({
  // tsconfig says `jsx: preserve` because Next owns the JSX transform; oxc
  // reads that as "classic" and every rendered element then throws
  // `React is not defined`. Name the runtime Next actually uses.
  //
  // `oxc` rather than `esbuild` — see apps/blog/vitest.config.mts for the
  // mechanism. Short version: Vite 8 converts an `esbuild` block to oxc only
  // when nothing else has set `oxc`, and Vitest always sets one, so `esbuild`
  // here would be silently ignored rather than merely deprecated.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    // Mirrors tsconfig's "@/*": ["./*"] — app/** routes import lib/** via this
    // alias, and vitest doesn't read tsconfig paths on its own.
    alias: {
      '@': path.resolve(import.meta.dirname),
      // Every stub here stands in for a compiled Next build that does not exist
      // under vitest. See each file for which exports it provides and why the
      // rest are deliberately absent.
      'next/cache': path.resolve(import.meta.dirname, '__tests__/stubs/next-cache.ts'),
      'next/server': path.resolve(import.meta.dirname, '__tests__/stubs/next-server.ts'),
      'next/navigation': path.resolve(
        import.meta.dirname,
        '__tests__/stubs/next-navigation.ts',
      ),
      'next/headers': path.resolve(
        import.meta.dirname,
        '__tests__/stubs/next-headers.ts',
      ),
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
    // A FLOOR, measured rather than aspired to. The four numbers below are what
    // this suite actually covers today, less about two points of slack — they
    // exist to stop coverage falling out of the app unnoticed, not to describe
    // a target. Raise them when the real number moves up; never lower them to
    // make a red run green.
    coverage: {
      // On for the plain `vitest run`, not just `--coverage`: thresholds are
      // only evaluated when coverage is enabled, so without this the floor
      // would never run in CI's `test` job and would be a comment rather than a
      // gate. The same reason packages/ui states for its own.
      enabled: true,
      // Read from the filesystem, not from what the suite imports. v8
      // instruments only the modules a test pulls in, so without this the
      // denominator is "files that already have a test" and a module shipped
      // with none is invisible rather than zero — which is how
      // app/api/stories/route.ts sat untested without moving any number.
      include: [
        'app/**/*.{ts,tsx}',
        'components/**/*.tsx',
        'hooks/**/*.ts',
        'lib/**/*.ts',
        // Named on its own because it is the one module that answers a request
        // without living under `app/` — the proxy runs before the router does.
        'proxy.ts',
      ],
      // `scripts/` is deliberately absent, and it is the one omission here that
      // is not bookkeeping. capture-set.mjs runs `check` at module scope against
      // real deps — a Storybook build, a browser, the pinned image — so no suite
      // can import it and its coverage would be a fixed 0 that only ever drags
      // the floor down. The gap is named where it lives, in that file's header,
      // rather than encoded as a number nobody can move.
      exclude: ['**/*.test.{ts,tsx}'],
      // Explicit, so a run writes no `coverage/` directory: `text` is what names
      // the files when the floor breaks, and the default reporter set would add
      // html/clover/json artifacts nothing here reads.
      reporter: ['text', 'text-summary'],
      thresholds: { statements: 93, branches: 87, functions: 92, lines: 94 },
    },
  },
});
