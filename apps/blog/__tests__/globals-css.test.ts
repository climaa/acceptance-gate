import * as fs from 'node:fs';
import * as path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — same reason as
// content.test.ts: tsconfig's `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';

/**
 * globals.css holds only what this app draws itself. Everything the design
 * system now renders was deleted along with the markup that used it, and this
 * is what keeps the next one from being left behind: dead CSS ships, costs
 * bytes, and is invisible to every other check in the repo.
 *
 * Structural, never appearance: no colour, size or ratio is read here — only
 * which selectors exist and whether anything renders them.
 */

const BLOG_DIR = path.resolve(__dirname, '..');
const GLOBALS_CSS = path.join(BLOG_DIR, 'app', 'globals.css');

/** Class names the design system owns; a rule naming one is a duplicate of it. */
const RETIRED = [
  'site-header',
  'site-header__inner',
  'site-brand',
  'site-nav',
  'site-footer',
  'post-card__link',
  'post-card__title',
  'post-card__desc',
  'post-meta',
  'article-header',
  'article-header__title',
];

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

/** Everything that can name a class: the app's own sources and the stylesheet. */
const sources = ['app', 'lib']
  .flatMap((dir) => walk(path.join(BLOG_DIR, dir)))
  .filter((file) => /\.(tsx?|css)$/.test(file))
  .map((file) => ({
    name: path.relative(BLOG_DIR, file),
    isStylesheet: file === GLOBALS_CSS,
    text: fs.readFileSync(file, 'utf8'),
  }));

const css = fs
  .readFileSync(GLOBALS_CSS, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  // `@import '@gate/ui/styles.css';` would otherwise read as a `.css` selector.
  .replace(/@[^;{]*;/g, '');

/** Every class name the stylesheet declares a rule for. */
const declaredClasses = [
  ...new Set(
    [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap(
      ([, selector]) => (selector ?? '').match(/\.[-\w]+/g) ?? [],
    ),
  ),
].sort();

/**
 * The class as a whole word, so `site-header` does not match the design
 * system's own `ds-site-header` in rendered markup or in an import.
 */
const mentions = (text: string, className: string) =>
  new RegExp(`(?<![\\w-])${className}(?![\\w-])`).test(text);

describe('app/globals.css', () => {
  // A sweep that found no rules would pass forever while protecting nothing —
  // the same guard ui-copy.test.ts carries.
  it('declares rules to check', () => {
    expect(declaredClasses.length).toBeGreaterThan(0);
  });

  it.each(declaredClasses)('%s is rendered by something', (selector) => {
    const className = selector.slice(1);

    const consumers = sources.filter(
      (source) => !source.isStylesheet && mentions(source.text, className),
    );

    expect(consumers).not.toHaveLength(0);
  });
});

describe('the design system’s markup', () => {
  // Not just absent from the stylesheet: a page still writing one of these has
  // markup of its own where a component belongs, which is the duplication this
  // whole change removes.
  it.each(RETIRED)('%s survives nowhere in the app', (className) => {
    const survivors = sources
      .filter((source) => mentions(source.text, className))
      .map((source) => source.name);

    expect(survivors).toEqual([]);
  });
});
