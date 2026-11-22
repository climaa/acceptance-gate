import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TopBar, type TopBarProps } from './TopBar';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document.
afterEach(cleanup);

const PROPS: TopBarProps = {
  breadcrumb: [
    { label: 'acceptance-gate', href: '/' },
    { label: 'pyramid', href: '/pyramid' },
    { label: 'Overview' },
  ],
  githubHref: 'https://github.com/climaa/acceptance-gate',
  onSearch: () => {},
  onMenuClick: () => {},
  menuExpanded: false,
  menuControls: 'census-sidebar',
};

const menu = () => screen.getByRole('button', { name: 'Open navigation' });

describe('TopBar', () => {
  it('reuses the Breadcrumb for the path, current page last', () => {
    render(<TopBar {...PROPS} />);

    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });

    expect(trail.querySelector('[aria-current="page"]')?.textContent).toBe('Overview');
  });

  it('opens search from its trigger and advertises the ⌘K shortcut', () => {
    const onSearch = vi.fn();
    render(<TopBar {...PROPS} onSearch={onSearch} />);
    const search = screen.getByRole('button', { name: 'Search' });

    fireEvent.click(search);

    expect(onSearch).toHaveBeenCalledOnce();
    expect(search.getAttribute('aria-keyshortcuts')).toBe('Meta+K');
  });

  it('links to the repository on GitHub', () => {
    render(<TopBar {...PROPS} />);

    const github = screen.getByRole('link', { name: 'GitHub' });

    expect(github.getAttribute('href')).toBe('https://github.com/climaa/acceptance-gate');
  });

  it('carries the theme toggle', () => {
    render(<TopBar {...PROPS} />);

    const theme = screen.getByRole('button', { name: 'Dark theme' });

    expect(theme.getAttribute('aria-pressed')).toBe('false');
  });

  it('announces whether the drawer its menu button controls is open', () => {
    render(<TopBar {...PROPS} menuExpanded />);

    expect(menu().getAttribute('aria-expanded')).toBe('true');
    expect(menu().getAttribute('aria-controls')).toBe('census-sidebar');
  });

  it('announces the drawer as closed', () => {
    render(<TopBar {...PROPS} />);

    expect(menu().getAttribute('aria-expanded')).toBe('false');
  });

  it('hands the menu press to the caller', () => {
    const onMenuClick = vi.fn();
    render(<TopBar {...PROPS} onMenuClick={onMenuClick} />);

    fireEvent.click(menu());

    expect(onMenuClick).toHaveBeenCalledOnce();
  });

  it('renders no menu button when there is no drawer to open', () => {
    render(<TopBar {...PROPS} onMenuClick={undefined} />);

    expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull();
  });

  it('renders no GitHub link without an href', () => {
    render(<TopBar {...PROPS} githubHref={undefined} />);

    expect(screen.queryByRole('link', { name: 'GitHub' })).toBeNull();
  });

  it('renders with zero axe violations', async () => {
    const { container } = render(<TopBar {...PROPS} />);

    const results = await axe.run(container, {
      runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    });

    expect(results.violations).toEqual([]);
  });
});
