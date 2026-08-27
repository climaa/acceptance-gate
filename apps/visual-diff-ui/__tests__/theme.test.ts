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
 * No jsdom: the rule touches `localStorage`, `matchMedia` and
 * `document.documentElement.dataset` and nothing else, so stubbing those three
 * is a smaller and more exact frame than a whole document.
 */

/** What `<html>` ends up carrying, for one stored value, per encoding. */
function attributeAfterScript(stored: string | null): string | undefined {
  const root: { dataset: { theme?: string } } = { dataset: {} };
  vi.stubGlobal('document', { documentElement: root });
  vi.stubGlobal('localStorage', { getItem: () => stored });

  new Function(THEME_SCRIPT)();

  return root.dataset.theme;
}

function attributeAfterFunction(stored: string | null): string | undefined {
  const root: { dataset: { theme?: string } } = { dataset: {} };
  vi.stubGlobal('document', { documentElement: root });
  vi.stubGlobal('localStorage', { getItem: () => stored });

  applyStoredTheme();

  return root.dataset.theme;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the theme rule, in both of its encodings', () => {
  // Light is the ABSENCE of the attribute — tokens.css has no
  // `[data-theme='light']` block for a written one to select.
  it.each([
    ['dark', 'dark'],
    ['light', undefined],
    [null, undefined],
  ])('stored %s leaves data-theme %s, whichever encoding ran', (stored, expected) => {
    const fromScript = attributeAfterScript(stored);
    const fromFunction = attributeAfterFunction(stored);

    expect(fromScript).toBe(expected);
    expect(fromFunction).toBe(expected);
  });

  // The console's rule has no `matchMedia` at all, and that is the difference
  // from the blog's: a capture needs a theme it chose, never one the capture
  // machine's OS happened to be set to.
  it('never consults the OS, even with nothing stored', () => {
    const matchMedia = vi.fn(() => ({ matches: true }));
    vi.stubGlobal('matchMedia', matchMedia);

    attributeAfterScript(null);
    attributeAfterFunction(null);

    expect(matchMedia).not.toHaveBeenCalled();
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
