import * as path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — tsconfig includes
// this file, so tsc typechecks it.
import { APP_ROOTS, APPS } from '@gate/visual-diff/policy';
import { describe, expect, it } from 'vitest';
import { appRootFor } from '../.storybook/main';

/**
 * Which app a `@/…` specifier means.
 *
 * Every storied app maps `@/*` to its own root, and one Vite alias cannot hold
 * three targets for one key, so `main.ts` resolves the prefix against the
 * importer. The failure this holds is silent: the blog and the manual both carry
 * a `lib/site`, so a manual screen sent to the blog's root builds and renders the
 * other app's words.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

/** Each policy app, with the directory its `@/` must resolve to. */
const apps = APP_ROOTS.map((root, index) => ({
  app: APPS[index] ?? '',
  appRoot: path.join(REPO_ROOT, ...root.slice(0, -1)),
}));

describe('a `@/` specifier', () => {
  it.each(apps)('written inside apps/$app resolves to that app', ({ appRoot }) => {
    const importer = path.join(appRoot, 'app', '_screens', 'Home.stories.tsx');

    expect(appRootFor(importer)).toBe(appRoot);
  });

  // The prefix trap: `apps/blog-archive` must not be read as `apps/blog`.
  it('written in an app whose name starts with a storied one resolves to none', () => {
    const importer = path.join(REPO_ROOT, 'apps', 'blog-archive', 'app', 'page.tsx');

    expect(appRootFor(importer)).toBeUndefined();
  });

  it('written outside every storied app resolves to no app at all', () => {
    const importer = path.join(REPO_ROOT, 'packages', 'ui', 'src', 'atoms', 'x.tsx');

    expect(appRootFor(importer)).toBeUndefined();
  });

  it('written with Windows separators still finds its app', () => {
    const appRoot = path.join(REPO_ROOT, 'apps', 'manual');
    const importer = path.join(appRoot, 'app', 'page.tsx').replaceAll('/', '\\');

    expect(appRootFor(importer)).toBe(appRoot);
  });
});
