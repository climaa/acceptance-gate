import { createElement } from 'react';
// Imported explicitly rather than relying on `globals: true` — same reason as
// content.test.ts: tsconfig's `**/*.ts` include means tsc typechecks this file.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY } from '@gate/ui';
import RootLayout from '../app/layout';
import { THEME_SCRIPT } from '../lib/theme';

/**
 * What the document says before anything runs. Both halves are invisible in
 * development and permanent once a baseline is taken: a returning dark-mode
 * reader gets a light frame if the inline script drifts from the key
 * ThemeToggle writes, and `font-display: block` holds the first screen blank
 * for as long as the browser takes to discover the face.
 *
 * Not an appearance suite — nothing here asserts a colour, a size or a face's
 * shape, which are the differ's. It asserts what the head contains and what the
 * script does when it runs, which no capture can show.
 */

/**
 * The faces the first screen paints in — the header's nav and brand, and every
 * page's first heading — spelled out rather than imported: an expectation that
 * reads the layout's own list cannot catch that list being wrong. The layout
 * says why these three and not JetBrains Mono; this is the list that fails if a
 * fourth preload appears.
 */
const ABOVE_THE_FOLD_FACES = [
  'atkinson-hyperlegible-latin-400-normal.woff2',
  'atkinson-hyperlegible-latin-700-normal.woff2',
  'fraunces-latin-600-normal.woff2',
];

// Rendered without JSX, since vitest collects `__tests__/**/*.test.ts`, and
// without children: this head is the same on every route.
const head = () => {
  const markup = renderToStaticMarkup(createElement(RootLayout, null, null));

  return markup.slice(0, markup.indexOf('</head>'));
};

const fontPreloads = () =>
  (head().match(/<link\b[^>]*>/g) ?? []).filter((tag) => /\bas="font"/.test(tag));

const hrefOf = (tag: string) => /href="([^"]*)"/.exec(tag)?.[1] ?? '';

/**
 * The committed file name behind a bundled asset URL, hash and query stripped.
 * The URL itself is the bundler's and differs between this suite and a build,
 * so the face is what these assertions can hold — that the two URLs are one
 * asset is what importing the woff2, rather than writing a path, buys.
 */
const faceOf = (tag: string) =>
  hrefOf(tag)
    .replace(/^.*\//, '')
    .replace(/\?.*$/, '')
    .replace(/\.[^.]+\.woff2$/, '.woff2');

/**
 * The script runs before React, before the bundle, and before anything defines
 * a window: `document`, `localStorage` and `matchMedia` are the only three
 * globals it may touch, so handing it exactly those three is both the sandbox
 * and an assertion. `matchMedia` defaults to "system prefers light" so a test
 * that only cares about the stored-choice path doesn't have to pass one.
 */
const runThemeScript = (
  storage: Partial<Storage>,
  matchMedia: (query: string) => { matches: boolean } = () => ({ matches: false }),
) => {
  const documentElement = { dataset: {} as Record<string, string> };

  new Function('document', 'localStorage', 'matchMedia', THEME_SCRIPT)(
    { documentElement },
    storage,
    matchMedia,
  );

  return documentElement.dataset;
};

const storageHolding = (value: string | null): Partial<Storage> => ({
  getItem: () => value,
});

const systemPrefers = (dark: boolean) => () => ({ matches: dark });

describe('the font preloads', () => {
  it('covers the faces the header and the first heading paint in', () => {
    const preloaded = fontPreloads().map(faceOf);

    expect(preloaded.sort()).toEqual(ABOVE_THE_FOLD_FACES);
  });

  // Same-origin fonts are fetched in CORS mode regardless, so a preload without
  // `crossorigin` misses the cache the stylesheet's own request uses and the
  // face is downloaded twice — the classic way a preload makes a page slower.
  // `react-dom`'s preload() supplies it for `as: 'font'` on its own; this holds
  // the emitted head to it however the link comes to exist.
  it('declares crossorigin on every face, since fonts are always CORS', () => {
    const preloads = fontPreloads();

    expect(preloads.every((tag) => /\bcrossorigin=/.test(tag))).toBe(true);
  });

  it('declares the woff2 type, so a browser can skip what it cannot use', () => {
    const preloads = fontPreloads();

    expect(preloads.every((tag) => tag.includes('type="font/woff2"'))).toBe(true);
  });
});

describe('the pre-hydration theme script', () => {
  it('is inlined in the head, where it runs before the first paint', () => {
    const markup = head();

    expect(markup).toContain(THEME_SCRIPT);
  });

  // Read off the script text, not off a run: the sandbox's storage answers
  // whatever key it is handed, so no execution below can catch the one key that
  // matters being the wrong one.
  it('reads the key ThemeToggle persists under', () => {
    expect(THEME_SCRIPT).toContain(THEME_STORAGE_KEY);
  });

  it('sets the attribute for a reader who chose dark', () => {
    const dataset = runThemeScript(storageHolding('dark'));

    expect(dataset.theme).toBe('dark');
  });

  // Light is the absence of the attribute, exactly as ThemeToggle writes it:
  // tokens.css has no `[data-theme='light']` block to select.
  it('leaves the attribute off for a reader who chose light', () => {
    const dataset = runThemeScript(storageHolding('light'));

    expect(dataset.theme).toBeUndefined();
  });

  it('leaves the attribute off for a first-time reader whose system prefers light', () => {
    const dataset = runThemeScript(storageHolding(null), systemPrefers(false));

    expect(dataset.theme).toBeUndefined();
  });

  // The one case this script exists to fix: a reader who has never touched the
  // toggle but told their OS they prefer dark should not have to tell this site
  // too.
  it('sets the attribute for a first-time reader whose system prefers dark', () => {
    const dataset = runThemeScript(storageHolding(null), systemPrefers(true));

    expect(dataset.theme).toBe('dark');
  });

  // The media query is a first-visit default, never a live override — an
  // explicit choice has to win in both directions, or the toggle would stop
  // meaning anything the moment a reader's OS disagreed with it.
  it('an explicit light choice overrides a system that prefers dark', () => {
    const dataset = runThemeScript(storageHolding('light'), systemPrefers(true));

    expect(dataset.theme).toBeUndefined();
  });

  it('an explicit dark choice overrides a system that prefers light', () => {
    const dataset = runThemeScript(storageHolding('dark'), systemPrefers(false));

    expect(dataset.theme).toBe('dark');
  });

  // Private mode and blocked site data make `localStorage` throw on access. An
  // exception here is not a lost theme, it is a parser error in <head>: the rest
  // of the document stops.
  it('survives a localStorage that throws', () => {
    const blocked: Partial<Storage> = {
      getItem: () => {
        throw new Error('The operation is insecure.');
      },
    };

    expect(() => runThemeScript(blocked)).not.toThrow();
  });

  // Presence, not absence, is the invariant now — paired with the override
  // tests above, which prove it never wins against an explicit choice.
  it('consults the media query as a first-visit default only', () => {
    expect(THEME_SCRIPT).toContain('prefers-color-scheme');
  });
});
