import { cleanup, render, screen, within } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { SiteHeader } from './SiteHeader';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(cleanup);

// Stands in for `next/link`, which packages/ui may not depend on (see SiteHeader.tsx).
// This is the shape the blog composes — a component of its own rendering an anchor.
function RouterLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a data-routed="true" {...props} />;
}

const NAV = [
  { label: 'Blog', href: '/blog' },
  { label: 'About', href: '/about' },
];

describe('SiteHeader', () => {
  it('renders the brand as a link home', () => {
    render(<SiteHeader brand="Carles Lima" nav={NAV} />);

    const brand = screen.getByRole('link', { name: 'Carles Lima' });

    expect(brand.getAttribute('href')).toBe('/');
  });

  it('renders one nav link per entry, in order', () => {
    render(<SiteHeader brand="Carles Lima" nav={NAV} />);

    const links = within(screen.getByRole('navigation')).getAllByRole('link');

    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Blog', '/blog'],
      ['About', '/about'],
    ]);
  });

  // The landmarks are the elements' own: a `role` spelled out here would only
  // repeat what `<header>` and `<nav>` already report.
  it('nests the nav landmark inside the banner, neither carrying a role attribute', () => {
    render(<SiteHeader brand="Carles Lima" nav={NAV} />);

    const [banner, nav] = [screen.getByRole('banner'), screen.getByRole('navigation')];

    expect(banner.contains(nav)).toBe(true);
    expect(banner.hasAttribute('role')).toBe(false);
    expect(nav.hasAttribute('role')).toBe(false);
  });

  it('renders the theme toggle', () => {
    render(<SiteHeader brand="Carles Lima" nav={NAV} />);

    const toggle = screen.getByRole('button', { name: 'Dark theme' });

    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  // The entire point of the component: a keyboard user's first tab must reach the
  // skip link, so it has to precede the brand, the nav and the toggle in the DOM.
  it('renders the skip link as the first focusable element', () => {
    const { container } = render(<SiteHeader brand="Carles Lima" nav={NAV} />);

    const focusable = container.querySelectorAll('a[href], button');

    expect(focusable[0]).toBe(screen.getByRole('link', { name: 'Skip to content' }));
  });

  it('points the skip link at a caller-supplied target id', () => {
    render(<SiteHeader brand="Carles Lima" nav={NAV} skipTargetId="content" />);

    const skip = screen.getByRole('link', { name: 'Skip to content' });

    expect(skip.getAttribute('href')).toBe('#content');
  });

  // Edge case: an empty nav must not leave an empty landmark behind — a `<nav>`
  // with nothing in it is announced by assistive tech and navigable to.
  it('renders no nav landmark when nav is empty', () => {
    render(<SiteHeader brand="Carles Lima" nav={[]} />);

    const nav = screen.queryByRole('navigation');

    expect(nav).toBeNull();
    expect(screen.getByRole('button', { name: 'Dark theme' })).not.toBeNull();
  });

  it('renders every brand and nav link as the component given by `as`', () => {
    render(<SiteHeader as={RouterLink} brand="Carles Lima" nav={NAV} />);

    const routed = screen
      .getAllByRole('link')
      .filter((link) => link.dataset.routed === 'true');

    expect(routed.map((link) => link.getAttribute('href'))).toEqual([
      '/',
      '/blog',
      '/about',
    ]);
  });

  it('renders an element brand verbatim', () => {
    render(<SiteHeader brand={<span data-testid="wordmark">CL</span>} nav={NAV} />);

    const brand = screen.getByRole('link', { name: 'CL' });

    expect(brand.querySelector('[data-testid="wordmark"]')).not.toBeNull();
  });

  it('carries only the ds-site-header class by default', () => {
    const { container } = render(<SiteHeader brand="Carles Lima" nav={NAV} />);

    const header = container.firstElementChild;

    // Exact, not `toContain`: an omitted `className` must be filtered out
    // rather than joined in as a trailing empty or `undefined` class.
    expect(header?.className).toBe('ds-site-header');
  });

  it('appends a caller-supplied className to the base class', () => {
    const { container } = render(
      <SiteHeader brand="Carles Lima" className="u-mb-4" nav={NAV} />,
    );

    const header = container.firstElementChild;

    expect(header?.className).toBe('ds-site-header u-mb-4');
  });
});
