'use client';

import { useEffect, useState } from 'react';

/**
 * The one place the persisted-theme key is spelled. The blog's pre-hydration
 * script reads the same constant — a second, hand-typed copy that drifts by a
 * character produces a first-paint flash, and a flash is invisible to every
 * test in this repo.
 */
export const THEME_STORAGE_KEY = 'gate-theme';

/** What `localStorage` holds. `<html>` carries `dark` or nothing at all. */
export type Theme = 'light' | 'dark';

export interface ThemeToggleProps {
  className?: string;
  /** The accessible name. The board draws an icon-only control, so this is the
   *  only name the button has; `aria-pressed` supplies the state. */
  label?: string;
}

const DARK: Theme = 'dark';

/**
 * Light is the default `:root`, so light is the *absence* of the attribute —
 * writing `data-theme="light"` would select a `[data-theme='light']` block that
 * tokens.css deliberately does not have. Storage still spells both out: it has
 * to distinguish a chosen light from no choice at all.
 */
const applyTheme = (theme: Theme) => {
  const root = document.documentElement;

  if (theme === DARK) {
    root.dataset.theme = theme;
  } else {
    delete root.dataset.theme;
  }
};

/** Icon-only switch flipping `[data-theme='dark']` on `<html>`. */
export function ThemeToggle({ className, label = 'Dark theme' }: ThemeToggleProps) {
  const [isDark, setIsDark] = useState(false);

  // Read from the DOM, never from storage: the pre-hydration script has already
  // resolved the choice by first paint, and re-deriving it here would race that
  // script rather than adopt its answer. Also keeps the server's markup — which
  // knows no theme — from being what hydration settles on.
  useEffect(() => {
    setIsDark(document.documentElement.dataset.theme === DARK);
  }, []);

  const handleClick = () => {
    // One value drives both writes: the attribute and the stored choice cannot
    // disagree about which theme the reader just picked.
    const next: Theme = isDark ? 'light' : DARK;

    applyTheme(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
    setIsDark(next === DARK);
  };

  return (
    <button
      type="button"
      className={['ds-theme-toggle', className].filter(Boolean).join(' ')}
      aria-pressed={isDark}
      aria-label={label}
      onClick={handleClick}
    >
      {/* The knob and its crescent are the affordance, not the name: they say
          nothing `aria-label` and `aria-pressed` have not already said. */}
      <span className="ds-theme-toggle__knob" aria-hidden="true">
        <svg className="ds-theme-toggle__icon" viewBox="0 0 24 24">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      </span>
    </button>
  );
}
