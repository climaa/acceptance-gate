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
 * `prefers-color-scheme` is consulted exactly once, and only as a first-visit
 * default — never as a live, ongoing mechanism. CODING_STANDARDS still names
 * `[data-theme]` as the one thing that decides how the page renders: this
 * script writes into that same attribute and is never asked again once a
 * reader has an explicit stored choice, which is what keeps there from being
 * two sources of truth. `null` (no choice yet) is the only case that reaches
 * the media query; `'dark'` or `'light'` always wins outright. Dark is written
 * as an attribute, light as the absence of one, matching what the toggle
 * itself writes.
 *
 * This is the blog's script only. Storybook and visual-diff stay on the rule
 * as originally written — a capture pipeline needs a theme it chose, never
 * one the capture machine's OS happened to be set to.
 *
 * `localStorage` throws rather than returning null in private mode and with
 * site data blocked. An uncaught throw in `<head>` stops the parser, so the
 * one branch this script has is a `catch` that does nothing — wrapping the
 * media-query read too, so neither API's edge cases can compound the risk.
 */
export const THEME_SCRIPT =
  `try{var s=localStorage.getItem(${KEY});` +
  `if(s===null?matchMedia('(prefers-color-scheme: dark)').matches:s==='dark')` +
  `document.documentElement.dataset.theme='dark'}catch(e){}`;
