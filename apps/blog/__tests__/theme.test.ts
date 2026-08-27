// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyStoredTheme, resolveTheme, THEME_SCRIPT } from '../lib/theme';

/**
 * The theme rule, which this app now writes twice: once as `THEME_SCRIPT` for
 * the layout to inline, and once as `resolveTheme` for `app/global-error.tsx`,
 * where React builds the document and an inlined script would never run.
 *
 * Two encodings of one rule drift. These cases run BOTH against the same inputs
 * and compare the attribute each leaves behind, so a change to either that the
 * other does not follow fails here rather than in a reader's dark browser.
 *
 * No jsdom — this suite is `environment: 'node'`. The rule touches
 * `localStorage`, `matchMedia` and `document.documentElement.dataset` and
 * nothing else, so stubbing those three is a smaller and more exact frame than
 * a whole document.
 */

type Root = { dataset: { theme?: string } };

function frame(stored: string | null, prefersDark = false): Root {
  const root: Root = { dataset: {} };
  vi.stubGlobal('document', { documentElement: root });
  vi.stubGlobal('localStorage', { getItem: () => stored });
  vi.stubGlobal('matchMedia', () => ({ matches: prefersDark }));

  return root;
}

const attributeAfterScript = (stored: string | null, prefersDark = false) => {
  const root = frame(stored, prefersDark);
  new Function(THEME_SCRIPT)();

  return root.dataset.theme;
};

const attributeAfterFunction = (stored: string | null, prefersDark = false) => {
  const root = frame(stored, prefersDark);
  applyStoredTheme();

  return root.dataset.theme;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the theme rule, in both of its encodings', () => {
  // Light is the ABSENCE of the attribute — tokens.css has no
  // `[data-theme='light']` block for a written one to select.
  it.each([
    ['dark', false, 'dark'],
    ['light', false, undefined],
    // An explicit choice always wins over the media query, in EITHER direction.
    // A stored light with a dark OS is the case that proves the media query is
    // a first-visit default rather than a live mechanism.
    ['light', true, undefined],
    ['dark', true, 'dark'],
  ])(
    'stored %s with prefers-dark %s leaves data-theme %s, whichever encoding ran',
    (stored, prefersDark, expected) => {
      const fromScript = attributeAfterScript(stored, prefersDark);
      const fromFunction = attributeAfterFunction(stored, prefersDark);

      expect(fromScript).toBe(expected);
      expect(fromFunction).toBe(expected);
    },
  );

  // The documented exemption: no stored choice yet is the ONE case that reaches
  // the media query.
  it.each([
    [true, 'dark'],
    [false, undefined],
  ])('with nothing stored, follows the OS (prefers-dark %s)', (prefersDark, expected) => {
    const fromScript = attributeAfterScript(null, prefersDark);
    const fromFunction = attributeAfterFunction(null, prefersDark);

    expect(fromScript).toBe(expected);
    expect(fromFunction).toBe(expected);
  });

  // `localStorage` throws rather than returning null in private mode. An
  // uncaught throw inside global-error would replace the error page with a
  // blank one, which is the one outcome worse than the error.
  it('falls back to light when storage refuses to be read', () => {
    vi.stubGlobal('document', { documentElement: { dataset: {} } });
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('private mode');
      },
    });

    expect(resolveTheme()).toBe('light');
  });
});
