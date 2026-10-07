import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SiteFooter } from './SiteFooter';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(cleanup);

const links = [
  { label: 'RSS', href: '/rss.xml' },
  { label: 'GitHub', href: 'https://github.com/climaa' },
];

describe('SiteFooter', () => {
  it('renders the copyright text with the given year', () => {
    render(
      <SiteFooter
        year={2026}
        copyright="Carlos Lima — built by its own agent pipeline"
        links={links}
      />,
    );

    screen.getByText('© 2026 Carlos Lima — built by its own agent pipeline');
  });

  it('renders one link per entry', () => {
    render(<SiteFooter year={2026} copyright="Carlos Lima" links={links} />);

    const rss = screen.getByRole('link', { name: 'RSS' });
    const github = screen.getByRole('link', { name: 'GitHub' });

    expect(rss.getAttribute('href')).toBe('/rss.xml');
    expect(github.getAttribute('href')).toBe('https://github.com/climaa');
  });

  it('renders as a semantic footer landmark', () => {
    render(<SiteFooter year={2026} copyright="Carlos Lima" links={links} />);

    expect(screen.getByRole('contentinfo').tagName).toBe('FOOTER');
  });

  it('renders whatever year the prop says', () => {
    render(<SiteFooter year={1999} copyright="Carlos Lima" links={links} />);

    screen.getByText('© 1999 Carlos Lima');
  });

  // Guards against a `new Date()` call sneaking back in: a component that computed
  // the current year itself would still satisfy every year assertion above, so only
  // a spy tells a pinned year apart from a coincidence.
  it('reads no clock while rendering', () => {
    const dateSpy = vi.spyOn(globalThis, 'Date');

    render(<SiteFooter year={2001} copyright="Carlos Lima" links={links} />);

    expect(dateSpy).not.toHaveBeenCalled();
    dateSpy.mockRestore();
  });

  it('appends a caller-supplied className', () => {
    const { container } = render(
      <SiteFooter year={2026} copyright="Carlos Lima" links={links} className="u-mt-8" />,
    );

    expect(container.firstElementChild?.className).toBe('ds-site-footer u-mt-8');
  });

  it('carries only the block class when no className is supplied', () => {
    const { container } = render(
      <SiteFooter year={2026} copyright="Carlos Lima" links={links} />,
    );

    expect(container.firstElementChild?.className).toBe('ds-site-footer');
  });

  // Edge case: an empty links array still leaves the copyright line standing.
  it('renders no links for an empty links array', () => {
    render(<SiteFooter year={2026} copyright="Carlos Lima" links={[]} />);

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    screen.getByText('© 2026 Carlos Lima');
  });

  it('ends the copyright line with the version, as plain text', () => {
    render(
      <SiteFooter year={2026} copyright="Carlos Lima" version="1.5.0" links={links} />,
    );

    // textContent is what a reader copying the line gets, so it is the contract.
    expect(screen.getByRole('contentinfo').textContent).toContain(
      '© 2026 Carlos Lima · v1.5.0',
    );
    expect(screen.queryByRole('link', { name: 'v1.5.0' })).toBeNull();
  });

  it('links the version where the caller says the release notes are', () => {
    render(
      <SiteFooter
        year={2026}
        copyright="Carlos Lima"
        version="1.5.0"
        versionHref="/changelog"
        links={links}
      />,
    );

    const version = screen.getByRole('link', { name: 'v1.5.0' });

    expect(version.getAttribute('href')).toBe('/changelog');
  });

  // Focus order follows what a reader sees: the version is first on the line, so a
  // keyboard reaches it before the nav, not after it.
  it('reaches the version link before the footer links, in reading order', () => {
    render(
      <SiteFooter
        year={2026}
        copyright="Carlos Lima"
        version="1.5.0"
        versionHref="/changelog"
        links={links}
      />,
    );

    const names = screen.getAllByRole('link').map((link) => link.textContent);

    expect(names).toEqual(['v1.5.0', 'RSS', 'GitHub']);
  });

  it('prints no separator when there is no version', () => {
    render(<SiteFooter year={2026} copyright="Carlos Lima" links={links} />);

    expect(screen.getByRole('contentinfo').textContent).not.toContain('·');
  });
});
