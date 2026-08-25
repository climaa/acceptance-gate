import * as fs from 'node:fs';
import * as path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';

/**
 * The console's stylesheet, checked structurally — never for how it looks.
 *
 * What a rule DOES is visual-diff's business, and this suite could not see it if
 * it tried: jsdom computes no cascade, and a pixel is what the differ compares.
 * What this suite can see is whether a rule is attached to anything at all, which
 * is a fact about the source rather than about the render.
 *
 * It exists because the stylesheet had no boundary. 1,181 lines in one file,
 * sections marked by comment banners, and a banner cannot be enforced: a
 * component could not take its rules with it when it moved, and could not take
 * them with it when it went. The split into `app/styles/*.css` gives the first
 * half of that; this gives the second.
 *
 * It found one on the way in. `.vd-field__select` styled a `<select>` the run
 * panel does not have — grouped with `.vd-field__input`, so it read as part of a
 * live rule and cost nothing to leave. That is the whole failure mode: dead CSS
 * does not break anything, which is why it accumulates.
 */

const APP_ROOT = process.cwd();
const STYLES = path.join(APP_ROOT, 'app', 'styles');

/** Every `.vd-` class the stylesheet defines, and which file defines it. */
function definedClasses(): Map<string, string> {
  const defined = new Map<string, string>();

  for (const file of fs.readdirSync(STYLES).sort()) {
    const source = fs.readFileSync(path.join(STYLES, file), 'utf8');
    for (const match of source.matchAll(/\.(vd-[A-Za-z0-9_-]+)/g)) {
      const name = match[1];
      if (name && !defined.has(name)) defined.set(name, file);
    }
  }

  return defined;
}

/**
 * Every `vd-` token the components mention, however they mention it.
 *
 * Deliberately not parsed as `className` — ids and `aria-labelledby` targets share
 * the prefix, and a token that is only an id still proves nothing is orphaned. The
 * question here is "does anything name this", not "is it a class".
 */
function mentionedTokens(): Set<string> {
  const files = ['components', 'app'].flatMap((dir) =>
    fs
      .readdirSync(path.join(APP_ROOT, dir), { recursive: true })
      .map(String)
      .filter((name) => name.endsWith('.tsx'))
      .map((name) => path.join(dir, name)),
  );

  return new Set(
    files.flatMap((file) =>
      [
        ...fs
          .readFileSync(path.join(APP_ROOT, file), 'utf8')
          .matchAll(/vd-[A-Za-z0-9_-]*/g),
      ].map((match) => match[0]),
    ),
  );
}

describe('the stylesheet is attached to the markup', () => {
  /**
   * A class in the CSS that no component names is a rule nothing can reach.
   *
   * Interpolated names are matched by their prefix: `vd-outcome--${tone}` appears
   * in the source as `vd-outcome--`, so every `.vd-outcome--*` counts as named. The
   * prefix has to end at a separator for that to apply, which is what keeps
   * `vd-card` from vouching for `vd-card__title` — those are written out in full
   * and are matched in full.
   */
  it('defines no class the components never name', () => {
    const mentioned = mentionedTokens();
    const named = (cls: string) =>
      mentioned.has(cls) ||
      [...mentioned].some((token) =>
        token.endsWith('-') || token.endsWith('_') ? cls.startsWith(token) : false,
      );

    const orphans = [...definedClasses()]
      .filter(([cls]) => !named(cls))
      .map(([cls, file]) => `${file}: .${cls}`);

    expect(orphans).toEqual([]);
  });

  /** The walk found the stylesheet, rather than passing on an empty directory. */
  it('reads every stylesheet the manifest imports', () => {
    const manifest = fs.readFileSync(path.join(APP_ROOT, 'app', 'globals.css'), 'utf8');
    const imported = [...manifest.matchAll(/@import '\.\/styles\/([^']+)'/g)].map(
      (match) => match[1],
    );

    expect(imported.sort()).toEqual(fs.readdirSync(STYLES).sort());
    expect(definedClasses().size).toBeGreaterThan(50);
  });

  /**
   * `wide.css` last, because it is one `@media (min-width: 768px)` block that
   * overrides the files above it. Order in the manifest IS the cascade, and this
   * is the one ordering constraint that is not obvious from reading any single
   * file.
   */
  it('imports the wide-viewport overrides last', () => {
    const manifest = fs.readFileSync(path.join(APP_ROOT, 'app', 'globals.css'), 'utf8');
    const imported = [...manifest.matchAll(/@import '\.\/styles\/([^']+)'/g)].map(
      (match) => match[1],
    );

    expect(imported.at(-1)).toBe('wide.css');
  });
});
