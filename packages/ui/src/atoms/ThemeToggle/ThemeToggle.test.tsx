import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { THEME_STORAGE_KEY } from './theme';
import { ThemeToggle } from './ThemeToggle';

// `globals` is off in vitest.config.ts, so Testing Library never sees a global
// `afterEach` to hook its automatic cleanup onto — without this every render
// stacks in the same document and `getByRole` matches the previous test's DOM.
afterEach(cleanup);

// The component writes to two singletons this suite shares with every other
// test in the file: <html> and localStorage. Neither is torn down by `cleanup`.
afterEach(() => {
  delete document.documentElement.dataset.theme;
  localStorage.clear();
});

const toggle = () => screen.getByRole('button');

describe('ThemeToggle', () => {
  it('renders an unpressed button naming itself for the accessibility tree', () => {
    render(<ThemeToggle />);

    const button = toggle();

    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('Dark theme');
  });

  it('sets data-theme to dark on <html> when clicked', () => {
    render(<ThemeToggle />);

    fireEvent.click(toggle());

    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('removes data-theme entirely when clicked back to light', () => {
    render(<ThemeToggle />);
    fireEvent.click(toggle());

    fireEvent.click(toggle());

    // Not `data-theme="light"`: light is the default `:root`, and tokens.css
    // has no `[data-theme='light']` block for the attribute to select.
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('tracks the dark state in aria-pressed', () => {
    render(<ThemeToggle />);

    fireEvent.click(toggle());

    expect(toggle().getAttribute('aria-pressed')).toBe('true');
  });

  it('persists the chosen theme under the exported storage key', () => {
    render(<ThemeToggle />);

    fireEvent.click(toggle());

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('persists light explicitly, so a stored choice is never absent', () => {
    render(<ThemeToggle />);
    fireEvent.click(toggle());

    fireEvent.click(toggle());

    // The DOM attribute is cleared rather than set to `light`, but storage has
    // to distinguish "chose light" from "never chose" — the pre-hydration
    // script falls back to the system preference only for the latter.
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('reports pressed on mount when <html> is already dark, without writing storage', () => {
    document.documentElement.dataset.theme = 'dark';

    render(<ThemeToggle />);

    // The pre-hydration script is the source of truth at first paint; deriving
    // the mount state from storage instead would race it, and writing on mount
    // would let a mount overwrite the choice it was supposed to read.
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('ignores a stored choice that disagrees with the attribute at first paint', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    render(<ThemeToggle />);

    expect(toggle().getAttribute('aria-pressed')).toBe('false');
  });

  it('carries only the block class when no className is supplied', () => {
    render(<ThemeToggle />);

    // Exact, not `toContain`: an omitted `className` must be filtered out
    // rather than joined in as a trailing empty or `undefined` class.
    expect(toggle().className).toBe('ds-theme-toggle');
  });

  it('appends a caller-supplied className', () => {
    render(<ThemeToggle className="u-ml-auto" />);

    expect(toggle().className).toBe('ds-theme-toggle u-ml-auto');
  });

  it('takes a caller-supplied label as its accessible name', () => {
    render(<ThemeToggle label="Cambiar tema" />);

    screen.getByRole('button', { name: 'Cambiar tema' });
  });

  it('never submits a form it is nested in', () => {
    render(<ThemeToggle />);

    // A `<button>` with no `type` defaults to `submit`; the toggle is a control,
    // not a submission, and the blog header may well grow a search form.
    expect(toggle().getAttribute('type')).toBe('button');
  });
});
