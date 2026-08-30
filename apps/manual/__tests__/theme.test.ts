import { describe, expect, it } from 'vitest';
import { resolveTheme, THEME_SCRIPT } from '@/lib/theme';

/**
 * One rule, two encodings: the string the layout inlines into `<head>`, and the
 * function `app/global-error.tsx` calls on mount because React builds that
 * document rather than parsing it. A copy that drifted would reinstate a
 * first-paint flash for one of them, and a flash is invisible to every other
 * test in this repo — so they are run against the same inputs and compared.
 *
 * The script is evaluated with `localStorage` and `document` passed in as
 * parameters rather than stubbed onto a DOM. It reads them as free variables, so
 * `new Function` can supply them, and the suite stays in a node environment with
 * no jsdom to install.
 */

type Store = { getItem: (key: string) => string | null };

/** What the inline script writes to `<html>`: 'dark', or nothing at all. */
function runScript(store: Store): string | undefined {
  const documentElement = { dataset: {} as Record<string, string> };

  new Function('localStorage', 'document', THEME_SCRIPT)(store, { documentElement });

  return documentElement.dataset.theme;
}

/** The same answer from the function, in the script's vocabulary. */
function runFunction(store: Store): string | undefined {
  const original = globalThis.localStorage;

  Object.defineProperty(globalThis, 'localStorage', {
    value: store,
    configurable: true,
  });

  try {
    return resolveTheme() === 'dark' ? 'dark' : undefined;
  } finally {
    Object.defineProperty(globalThis, 'localStorage', {
      value: original,
      configurable: true,
    });
  }
}

const STORES: [name: string, store: Store][] = [
  ['a stored dark choice', { getItem: () => 'dark' }],
  ['a stored light choice', { getItem: () => 'light' }],
  ['no choice yet', { getItem: () => null }],
  [
    'storage that throws, as in private mode',
    {
      getItem: () => {
        throw new Error('SecurityError');
      },
    },
  ],
  ['a value neither the toggle nor this app wrote', { getItem: () => 'sepia' }],
];

describe('the two encodings of the theme rule agree', () => {
  it.each(STORES)('%s', (_name, store) => {
    expect(runFunction(store)).toBe(runScript(store));
  });
});

describe('THEME_SCRIPT', () => {
  it('applies dark only for an explicitly stored dark choice', () => {
    expect(runScript({ getItem: () => 'dark' })).toBe('dark');
    expect(runScript({ getItem: () => 'light' })).toBeUndefined();
    expect(runScript({ getItem: () => null })).toBeUndefined();
  });

  it('never consults prefers-color-scheme', () => {
    // The rule `apps/blog` is the documented exception to. A `matchMedia` call
    // here would be a second theme mechanism competing with `[data-theme]`.
    expect(THEME_SCRIPT).not.toContain('matchMedia');
  });

  it('survives storage that throws rather than stopping the parser', () => {
    expect(() =>
      runScript({
        getItem: () => {
          throw new Error('SecurityError');
        },
      }),
    ).not.toThrow();
  });
});
