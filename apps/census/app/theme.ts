import { THEME_STORAGE_KEY } from '@gate/ui';

/** The key as a JS literal: this script is text until the browser parses it. */
const KEY = JSON.stringify(THEME_STORAGE_KEY);

/**
 * The reader's stored theme, re-applied in `<head>` before the first paint, so a
 * reader who chose dark does not get a light page on every reload. apps/manual's
 * script, for apps/manual's reasons: `[data-theme]` is the only switch and
 * `prefers-color-scheme` is never read; `localStorage` throws in private mode,
 * and an uncaught throw in `<head>` stops the parser, hence the empty `catch`.
 */
export const THEME_SCRIPT =
  `try{if(localStorage.getItem(${KEY})==='dark')` +
  `document.documentElement.dataset.theme='dark'}catch(e){}`;
