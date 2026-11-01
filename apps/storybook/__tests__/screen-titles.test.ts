import * as fs from 'node:fs';
import * as path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — tsconfig includes
// this file, so tsc typechecks it.
import { APP_ROOTS, APPS, appOf } from '@gate/visual-diff/policy';
import { describe, expect, it } from 'vitest';

/**
 * A screen's app is read off its title, never its path.
 *
 * The console splits the `screens` tier by app (`apps/visual-diff-ui/lib/
 * sections.ts`) and opens each screen on its own app's board, and both read the
 * app off the story id — which Storybook slugs from the title. A story copied
 * from one app into another and left titled for the first would sit under the
 * wrong app's tab and open the wrong app's board, with nothing to say so. So every
 * screen story is held here to the app whose directory holds it.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

/** Every `*.stories.tsx` under a directory, depth first. */
const storiesUnder = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name === 'node_modules' ? [] : storiesUnder(full);

    return entry.name.endsWith('.stories.tsx') ? [full] : [];
  });

const TITLE = /^\s*title:\s*'([^']+)'/m;

const screens = APP_ROOTS.flatMap((root, index) =>
  storiesUnder(path.join(REPO_ROOT, ...root)).map((file) => ({
    file: path.relative(REPO_ROOT, file),
    app: APPS[index] ?? '',
    title: TITLE.exec(fs.readFileSync(file, 'utf8'))?.[1] ?? '',
  })),
);

/** What Storybook slugs a title to, as far as the app segment goes. */
const idOf = (title: string) =>
  title.toLowerCase().replaceAll('/', '-').replaceAll(' ', '-');

describe('screen story titles', () => {
  it('finds the screens the policy captures', () => {
    expect(screens.length).toBeGreaterThan(0);
  });

  it.each(screens)('$file is titled under Screens/', ({ title }) => {
    expect(title.startsWith('Screens/')).toBe(true);
  });

  it.each(screens)('$file is titled under the app its directory is', ({ app, title }) => {
    expect(appOf(`${idOf(title)}--default`)).toBe(app);
  });
});
