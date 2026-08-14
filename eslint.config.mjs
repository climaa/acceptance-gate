// The root ESLint config, and the only one that is not a workspace's own.
//
// `turbo run lint` reaches workspaces, and `scripts/` is not one — the same
// structural gap `.sandcastle/` has, answered the same way: a standalone root
// script (`pnpm lint:scripts`) wired into the `checks` matrix, rather than
// making `scripts/` a pnpm workspace and dragging it into the build, typecheck
// and test graphs it has no business in.
import js from '@eslint/js';
import globals from 'globals';

const config = [
  // Every workspace under apps/ and packages/ carries its own flat config and is
  // linted by `turbo run lint` with that workspace as cwd; .sandcastle/ is
  // TypeScript held by `typecheck:sandcastle`. Naming them here keeps a bare
  // root `eslint .` honest about what this file is for rather than silently
  // walking the whole repo with no rules loaded.
  { ignores: ['apps/**', 'packages/**', '.sandcastle/**'] },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      // Zero-dep CLI scripts: they run on bare Node and touch process, console
      // and the fs/child_process builtins. Without this every one of those is a
      // `no-undef` error.
      globals: globals.node,
    },
    rules: js.configs.recommended.rules,
  },
];

export default config;
