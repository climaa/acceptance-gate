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

/**
 * The write half of the theme, in one place because three callers need it:
 * `ThemeToggle`, and each app's `global-error.tsx` — which has to apply the
 * theme itself, since React builds that document rather than parsing it and the
 * pre-hydration script the layout uses never runs there.
 *
 * Light is the default `:root`, so light is the ABSENCE of the attribute:
 * writing `data-theme="light"` would select a `[data-theme='light']` block
 * tokens.css deliberately does not have. Storage still spells both out — it has
 * to tell a chosen light from no choice at all.
 *
 * Here rather than in `ThemeToggle.tsx` for the same reason `THEME_STORAGE_KEY`
 * is: that module is `'use client'`, and its exports reach a Server Component as
 * client references rather than as the value.
 */
export const applyTheme = (theme: Theme) => {
  const root = document.documentElement;

  if (theme === 'dark') {
    root.dataset.theme = theme;
  } else {
    delete root.dataset.theme;
  }
};
