import { FULLPAGE_TAG } from '@gate/visual-diff/policy';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Sidebar, type SidebarProps } from './Sidebar';
import sidebarStories from './Sidebar.stories';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document.
afterEach(cleanup);

const PROPS: SidebarProps = {
  repository: 'acceptance-gate',
  title: 'pyramid',
  dimensions: [
    { id: 'overview', label: 'Overview', href: '/', count: 23, current: true },
    { id: 'code', label: 'Unit', href: '/?dimension=code', count: 9 },
    { id: 'health', label: 'Health', href: '/?dimension=health', count: 0 },
  ],
  workspaces: [
    { name: '@gate/ui', href: '/ui', category: 'packages', status: 'clear' },
    { name: '@gate/blog', href: '/blog', category: 'apps', status: 'gaps' },
    { name: 'scripts/', href: '/scripts', category: 'scripts', status: 'unmeasured' },
  ],
  collapsed: false,
  onCollapsedChange: () => {},
};

const sidebarWith = (props: Partial<SidebarProps> = {}) => (
  <>
    <button type="button">Open navigation</button>
    <Sidebar {...PROPS} {...props} />
  </>
);

const toggle = () => screen.getByRole('button', { name: /sidebar$/ });
const opener = () => screen.getByRole('button', { name: 'Open navigation' });
const closeButton = () => screen.getByRole('button', { name: 'Close navigation' });

describe('Sidebar', () => {
  it('is a named navigation landmark', () => {
    render(sidebarWith());

    const nav = screen.getByRole('navigation', { name: 'Sidebar' });

    expect(nav).toBeTruthy();
  });

  it('links every dimension to its own href and marks the current one', () => {
    render(sidebarWith());

    const current = screen.getByRole('link', { name: /^Overview/ });

    expect(screen.getByRole('link', { name: /^Unit/ }).getAttribute('href')).toBe(
      '/?dimension=code',
    );
    expect(current.getAttribute('aria-current')).toBe('page');
  });

  it('groups the workspaces under their category headings, in category order', () => {
    render(sidebarWith());

    const headings = screen.getAllByRole('heading', { level: 3 });

    expect(headings.map((heading) => heading.textContent)).toEqual([
      'packages',
      'apps',
      'scripts',
    ]);
  });

  it('names each workspace’s status in text, not only in the dot’s colour', () => {
    render(sidebarWith());

    const blog = screen.getByRole('link', { name: /@gate\/blog/ });

    expect(blog.textContent).toContain('has gaps');
  });

  it('announces the expanded state on the collapse toggle', () => {
    render(sidebarWith());

    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().getAttribute('aria-label')).toBe('Collapse sidebar');
  });

  it('announces the collapsed state on the same toggle', () => {
    render(sidebarWith({ collapsed: true }));

    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().getAttribute('aria-label')).toBe('Expand sidebar');
  });

  it('points the toggle at the sidebar it controls', () => {
    render(sidebarWith({ id: 'census-sidebar' }));

    const controlled = document.getElementById(
      toggle().getAttribute('aria-controls') ?? '',
    );

    expect(controlled?.id).toBe('census-sidebar');
  });

  it('asks the caller for the opposite state when the toggle is pressed', () => {
    const onCollapsedChange = vi.fn();
    render(sidebarWith({ onCollapsedChange }));

    fireEvent.click(toggle());

    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });

  it('asks to expand when the collapsed rail’s toggle is pressed', () => {
    const onCollapsedChange = vi.fn();
    render(sidebarWith({ collapsed: true, onCollapsedChange }));

    fireEvent.click(toggle());

    expect(onCollapsedChange).toHaveBeenCalledWith(false);
  });

  it('keeps every dimension’s name in the collapsed rail, where only its icon shows', () => {
    render(sidebarWith({ collapsed: true }));

    const link = screen.getByRole('link', { name: /^Unit/ });

    expect(link).toBeTruthy();
  });

  it('drops the workspaces from the collapsed rail', () => {
    render(sidebarWith({ collapsed: true }));

    expect(screen.queryByRole('link', { name: /@gate\/ui/ })).toBeNull();
  });

  it('marks a dimension with gaps in the rail and leaves one with none bare', () => {
    const { container } = render(sidebarWith({ collapsed: true }));

    const badges = container.querySelectorAll('.ds-sidebar__badge');

    expect(badges).toHaveLength(2);
  });

  it('closes the drawer from its close button', () => {
    const onCollapsedChange = vi.fn();
    render(sidebarWith({ onCollapsedChange }));

    fireEvent.click(closeButton());

    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });

  it('closes the drawer from the scrim', () => {
    const onCollapsedChange = vi.fn();
    const { container } = render(sidebarWith({ onCollapsedChange }));

    fireEvent.click(container.querySelector('.ds-sidebar__scrim') as Element);

    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });

  it('renders no scrim while collapsed', () => {
    const { container } = render(sidebarWith({ collapsed: true }));

    expect(container.querySelector('.ds-sidebar__scrim')).toBeNull();
  });

  describe('opened from outside, as the drawer', () => {
    const openFromTrigger = (props: Partial<SidebarProps> = {}) => {
      const view = render(sidebarWith({ collapsed: true, ...props }));
      opener().focus();
      view.rerender(sidebarWith({ collapsed: false, ...props }));
      return view;
    };

    it('moves focus into the drawer, onto its close button', () => {
      openFromTrigger();

      expect(document.activeElement).toBe(closeButton());
    });

    it('returns focus to the trigger when it closes', () => {
      const view = openFromTrigger();

      view.rerender(sidebarWith({ collapsed: true }));

      expect(document.activeElement).toBe(opener());
    });

    it('closes on Escape', () => {
      const onCollapsedChange = vi.fn();
      openFromTrigger({ onCollapsedChange });

      fireEvent.keyDown(closeButton(), { key: 'Escape' });

      expect(onCollapsedChange).toHaveBeenCalledWith(true);
    });
  });

  describe('expanded from its own toggle, as the desktop rail does', () => {
    it('leaves focus on the toggle rather than jumping into the list', () => {
      const view = render(sidebarWith({ collapsed: true }));
      toggle().focus();

      view.rerender(sidebarWith({ collapsed: false }));

      expect(document.activeElement).toBe(toggle());
    });

    it('ignores Escape, which would otherwise collapse an inline sidebar', () => {
      const onCollapsedChange = vi.fn();
      render(sidebarWith({ onCollapsedChange }));

      fireEvent.keyDown(toggle(), { key: 'Escape' });

      expect(onCollapsedChange).not.toHaveBeenCalled();
    });

    it('leaves focus alone when it collapses again', () => {
      const view = render(sidebarWith());
      toggle().focus();

      view.rerender(sidebarWith({ collapsed: true }));

      expect(document.activeElement).toBe(toggle());
    });
  });

  it.each([false, true])(
    'renders with zero axe violations (collapsed: %s)',
    async (collapsed) => {
      const { container } = render(sidebarWith({ collapsed }));

      const results = await axe.run(container, {
        runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
      });

      expect(results.violations).toEqual([]);
    },
  );

  it('is shot whole-page, the viewport its tiles are drawn at', () => {
    expect(sidebarStories.tags).toEqual([FULLPAGE_TAG]);
  });

  it('labels its brand link with the repository and title', () => {
    render(sidebarWith());

    const nav = screen.getByRole('navigation', { name: 'Sidebar' });

    expect(
      within(nav).getByRole('link', { name: /acceptance-gate.*pyramid/ }),
    ).toBeTruthy();
  });
});
