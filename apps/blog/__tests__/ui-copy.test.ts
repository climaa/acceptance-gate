import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
// Imported explicitly rather than relying on `globals: true` — same reason as
// content.test.ts: tsconfig's `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import { formatDate } from '../lib/posts';

/**
 * The repo standardises on English. This pins the user-facing half of that: every
 * string App Router code renders, the document language, and the route segments
 * themselves — `sobre-mi` was Spanish copy that had become a published URL.
 *
 * Post bodies under content/posts are deliberately out of scope and are not
 * scanned here; translating them is tracked separately.
 */

const APP_DIR = path.resolve(__dirname, '..', 'app');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const sourceFiles = walk(APP_DIR).filter((file) => /\.(tsx?|css)$/.test(file));

describe('apps/blog/app UI copy', () => {
  // A sweep that matched zero files would pass forever while protecting
  // nothing — the same guard content.test.ts carries.
  it('finds App Router sources to check', () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  describe.each(sourceFiles.map((f) => [path.relative(APP_DIR, f), f] as const))(
    '%s',
    (_name, file) => {
      const source = fs.readFileSync(file, 'utf8');

      // Cheap sweep: Spanish prose of any length almost always carries one of
      // these, so it catches new copy nobody thought to deny by name.
      it('has no Spanish accents or inverted punctuation', () => {
        expect(source).not.toMatch(/[áéíóúñÁÉÍÓÚÑ¿¡]/);
      });

      // Unaccented Spanish slips past that sweep, so the literals this app
      // once shipped are denied by name too.
      it.each(['de lectura', 'lang="es"', 'es_ES', 'sobre-mi'])(
        'does not contain %s',
        (needle) => {
          expect(source).not.toContain(needle);
        },
      );
    },
  );

  it('declares the document language as English', () => {
    const layout = fs.readFileSync(path.join(APP_DIR, 'layout.tsx'), 'utf8');
    expect(layout).toContain('lang="en"');
  });

  // `sobre-mi` was a route directory, not just copy: /sobre-mi was a published
  // URL linked from the site nav.
  it('serves the about page from /about', () => {
    expect(fs.existsSync(path.join(APP_DIR, 'about', 'page.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(APP_DIR, 'sobre-mi'))).toBe(false);
  });

  // Renaming a live route without a redirect starts returning 404 on it.
  it('permanently redirects /sobre-mi to /about', async () => {
    const configPath = path.resolve(__dirname, '..', 'next.config.mjs');
    const { default: config } = await import(pathToFileURL(configPath).href);
    const redirects = await config.redirects();

    expect(redirects).toContainEqual({
      source: '/sobre-mi',
      destination: '/about',
      permanent: true,
    });
  });
});

describe('lib/posts formatDate', () => {
  // Rendered on every card and article header, so the locale is UI copy too —
  // an es-ES default prints "7 de agosto de 2026" under English headings.
  it('formats dates in English by default', () => {
    expect(formatDate('2026-08-07')).toBe('August 7, 2026');
  });

  // The default moved, the parameter did not: callers can still pick a locale.
  it('formats dates in the locale it is given', () => {
    expect(formatDate('2026-08-07', 'es-ES')).toBe('7 de agosto de 2026');
  });
});
