import { THEME_STORAGE_KEY } from '@gate/ui';

/** The key as a JS literal: this script is text until the browser parses it. */
const KEY = JSON.stringify(THEME_STORAGE_KEY);

/**
 * The theme, resolved before the first paint.
 *
 * `ThemeToggle` sets `data-theme` after hydration, which is several hundred
 * milliseconds after the browser has already painted a light frame — so a
 * returning dark-mode reader sees a flash on every navigation into the site.
 * This runs in `<head>` instead, synchronously, before a single pixel exists.
 *
 * The key is imported, never retyped: a copy that drifts by a character
 * reinstates the flash and every test in this repo still passes.
 *
 * Deliberately not consulting `prefers-color-scheme` — CODING_STANDARDS names
 * `[data-theme]` as the one theme mechanism, and a script that honoured the
 * media query while the toggle ignored it would leave the page with two sources
 * of truth. Dark is written as an attribute, light as the absence of one,
 * matching what the toggle itself writes.
 *
 * `localStorage` throws rather than returning null in private mode and with
 * site data blocked. An uncaught throw in `<head>` stops the parser, so the one
 * branch this script has is a `catch` that does nothing.
 */
export const THEME_SCRIPT =
  `try{if(localStorage.getItem(${KEY})==='dark')` +
  `document.documentElement.dataset.theme='dark'}catch(e){}`;
