import { THEME_STORAGE_KEY } from '@gate/ui';

/** The key as a JS literal: this script is text until the browser parses it. */
const KEY = JSON.stringify(THEME_STORAGE_KEY);

/**
 * The reader's stored theme, re-applied before the first paint.
 *
 * `ThemeToggle` writes `data-theme` and reads it back from the DOM on mount, so
 * without this the attribute is simply gone after a reload: a reader who chose
 * dark gets a light console every time, and the toggle agrees with it. The
 * script runs in `<head>`, synchronously, before a single pixel exists.
 *
 * The key is imported, never retyped: a copy that drifts by a character makes
 * the choice unreadable and every test in this repo still passes.
 *
 * Unlike `apps/blog`'s script, `prefers-color-scheme` is never consulted — not
 * even as a first-visit default. CODING_STANDARDS names the blog's as the one
 * documented exception to `[data-theme]` being the only theme mechanism, and a
 * console whose screenshots are the subject of the page has no business
 * choosing a theme the reader did not.
 *
 * `localStorage` throws rather than returning null in private mode and with
 * site data blocked. An uncaught throw in `<head>` stops the parser, so the one
 * branch this script has is a `catch` that does nothing.
 */
export const THEME_SCRIPT =
  `try{if(localStorage.getItem(${KEY})==='dark')` +
  `document.documentElement.dataset.theme='dark'}catch(e){}`;
