/**
 * The one place the persisted-theme key is spelled. The blog's pre-hydration
 * script imports this rather than repeating the string — a hand-typed copy that
 * drifts by a character produces a first-paint flash, and a flash is invisible
 * to every test in this repo.
 *
 * It sits beside ThemeToggle rather than inside it because that script runs on
 * the server: a `'use client'` module's exports arrive at a React Server
 * Component as client references, so reading the key out of ThemeToggle.tsx
 * would inline a throwing proxy into the HTML instead of `gate-theme`.
 */
export const THEME_STORAGE_KEY = 'gate-theme';

/** What `localStorage` holds. `<html>` carries `dark` or nothing at all. */
export type Theme = 'light' | 'dark';
