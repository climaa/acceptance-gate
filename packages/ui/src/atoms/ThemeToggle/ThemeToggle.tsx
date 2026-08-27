'use client';

import { useEffect, useState } from 'react';

import { applyTheme, THEME_STORAGE_KEY, type Theme } from './theme';

export interface ThemeToggleProps {
  className?: string;
  /** The accessible name. The board draws an icon-only control, so this is the
   *  only name the button has; `aria-pressed` supplies the state. */
  label?: string;
}

/** Icon-only switch flipping `[data-theme='dark']` on `<html>`. */
export function ThemeToggle({ className, label = 'Dark theme' }: ThemeToggleProps) {
  const [isDark, setIsDark] = useState(false);

  // Read from the DOM, never from storage: the pre-hydration script has already
  // resolved the choice by first paint, and re-deriving it here would race that
  // script rather than adopt its answer. Also keeps the server's markup — which
  // knows no theme — from being what hydration settles on.
  useEffect(() => {
    setIsDark(document.documentElement.dataset.theme === 'dark');
  }, []);

  const handleClick = () => {
    // One value drives all three writes: the attribute, the stored choice and
    // the pressed state cannot disagree about which theme the reader picked.
    const next: Theme = isDark ? 'light' : 'dark';

    applyTheme(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
    setIsDark(next === 'dark');
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
