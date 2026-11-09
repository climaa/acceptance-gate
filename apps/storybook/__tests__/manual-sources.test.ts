import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The manual's screens read the `.feature` files through `.storybook/manual-
 * sources.ts`, which stands in for `apps/manual/lib/sources.ts` in a browser. The
 * two must name the same pages and the same files: a page the manual gains with no
 * entry here renders its screen with no text, and an entry pointing at another file
 * renders the wrong requirements, both with the Storybook build still green.
 *
 * Read off the sources rather than imported: one module reads files at import and
 * the other imports through Vite's `?raw`, which this runner does not resolve.
 */

const STORYBOOK_DIR = path.resolve(import.meta.dirname, '..');
const MANUAL_DIR = path.resolve(STORYBOOK_DIR, '..', 'manual');

/** `slug → file`, each file resolved against the directory it is written relative to. */
const entries = (source: string, pattern: RegExp, base: string) =>
  Object.fromEntries(
    [...source.matchAll(pattern)].map(([, slug = '', file = '']) => [
      slug,
      path.resolve(base, file),
    ]),
  );

const read = (file: string) => fs.readFileSync(file, 'utf8');

// `console: readFileSync('../e2e/…feature', 'utf8')`, relative to the manual's root.
const manual = entries(
  read(path.join(MANUAL_DIR, 'lib', 'sources.ts')),
  /^\s*(\w+): readFileSync\('([^']+)'/gm,
  MANUAL_DIR,
);

const storySource = read(path.join(STORYBOOK_DIR, '.storybook', 'manual-sources.ts'));

// `import consoleFeature from '../../e2e/…feature?raw'` plus `console: consoleFeature`.
const imported = Object.fromEntries(
  [...storySource.matchAll(/^import (\w+) from '([^']+)\?raw';/gm)].map(
    ([, name = '', file = '']) => [name, file],
  ),
);
const story = Object.fromEntries(
  [...storySource.matchAll(/^\s*(\w+): (\w+),$/gm)].map(([, slug = '', name = '']) => [
    slug,
    path.resolve(STORYBOOK_DIR, '.storybook', imported[name] ?? ''),
  ]),
);

describe("the manual's feature sources in Storybook", () => {
  it('finds the pages the manual publishes', () => {
    expect(Object.keys(manual).length).toBeGreaterThan(0);
  });

  it('names the same pages as the manual', () => {
    expect(Object.keys(story).sort()).toEqual(Object.keys(manual).sort());
  });

  it('reads each page from the same file as the manual', () => {
    expect(story).toEqual(manual);
  });
});
