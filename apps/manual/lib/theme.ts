import { applyTheme, THEME_STORAGE_KEY, type Theme } from '@gate/ui';

/** The key as a JS literal: this script is text until the browser parses it. */
const KEY = JSON.stringify(THEME_STORAGE_KEY);

/**
 * The reader's stored theme, re-applied before the first paint.
 *
 * `ThemeToggle` writes `data-theme` and reads it back from the DOM on mount, so
 * without this the attribute is simply gone after a reload: a reader who chose
 * dark gets a light page every time, and the toggle agrees with it. The script
 * runs in `<head>`, synchronously, before a single pixel exists.
 *
 * The key is imported, never retyped: a copy that drifts by a character makes
 * the choice unreadable and every test in this repo still passes.
 *
 * `prefers-color-scheme` is never consulted, not even as a first-visit default.
 * `apps/blog`'s script is the one documented exception to `[data-theme]` being
 * the only theme mechanism, and it argues for itself as a reading site with no
 * relationship to a capture. This app is neither that exception nor a capture
 * target — it is a manual whose screenshots are of a console photographed in a
 * theme somebody chose — so it stays on the rule as written.
 *
 * `localStorage` throws rather than returning null in private mode and with site
 * data blocked. An uncaught throw in `<head>` stops the parser, so the one
 * branch this script has is a `catch` that does nothing.
 */
export const THEME_SCRIPT =
  `try{if(localStorage.getItem(${KEY})==='dark')` +
  `document.documentElement.dataset.theme='dark'}catch(e){}`;

/**
 * The same resolution as `THEME_SCRIPT`, as code rather than as a string.
 *
 * `app/global-error.tsx` needs it because that file replaces the root layout:
 * React BUILDS that document instead of parsing it, and a `<script>` created
 * that way never executes — so the inline script cannot carry the theme there,
 * and the attribute the layout's copy had set is discarded with the document it
 * was set on.
 *
 * Two encodings of one rule is a drift risk, so `__tests__/theme.test.ts` runs
 * the script and this function against the same inputs and compares them.
 *
 * No `matchMedia`, exactly as the script has none. The read is wrapped because
 * `localStorage` throws rather than returning null in private mode, and an
 * uncaught throw in an error boundary would replace this page with a blank one.
 */
export function resolveTheme(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** The theme a document React built rather than parsed has to be given. */
export function applyStoredTheme(): void {
  applyTheme(resolveTheme());
}
