import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEATURE_SOURCES } from '../.storybook/manual-sources';

/**
 * The manual's screens read the `.feature` files through `.storybook/manual-
 * sources.ts`, which stands in for `apps/manual/lib/sources.ts` in a browser. The
 * two must name the same pages and carry the same text: a page the manual gains
 * with no entry here renders its screen with no text, and an entry pointing at
 * another file renders the wrong requirements, both with the Storybook build still
 * green.
 *
 * The stand-in is imported — this runner resolves Vite's `?raw` as Storybook does —
 * so what is checked is the text a story receives. The manual's module is read off
 * its source instead: it reads files at import, relative to the manual's root,
 * which is not this suite's working directory.
 */

const STORYBOOK_DIR = path.resolve(import.meta.dirname, '..');
const MANUAL_DIR = path.resolve(STORYBOOK_DIR, '..', 'manual');

const read = (file: string) => fs.readFileSync(file, 'utf8');

// `console: readFileSync('../e2e/…feature', 'utf8')` → `console → <that file's text>`.
const manual: Record<string, string> = Object.fromEntries(
  [
    ...read(path.join(MANUAL_DIR, 'lib', 'sources.ts')).matchAll(
      /^\s*(\w+): readFileSync\('([^']+)'/gm,
    ),
  ].map(([, slug = '', file = '']) => [slug, read(path.resolve(MANUAL_DIR, file))]),
);

describe("the manual's feature sources in Storybook", () => {
  it('finds the pages the manual publishes', () => {
    expect(Object.keys(manual).length).toBeGreaterThan(0);
  });

  it('names the same pages as the manual', () => {
    expect(Object.keys(FEATURE_SOURCES).sort()).toEqual(Object.keys(manual).sort());
  });

  it("gives each page the text of the manual's file for it", () => {
    for (const [slug, text] of Object.entries(FEATURE_SOURCES)) {
      expect(text, slug).toBe(manual[slug]);
    }
  });

  it('gives no page an empty text', () => {
    for (const [slug, text] of Object.entries(FEATURE_SOURCES)) {
      expect(text.trim(), slug).not.toBe('');
    }
  });
});
