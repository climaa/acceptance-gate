import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Breadcrumb } from './Breadcrumb';

afterEach(cleanup);

const PATH = [
  { label: 'acceptance-gate', href: '/' },
  { label: 'packages', href: '/?workspace=packages' },
  { label: '@gate/ui', href: '/ui' },
];

describe('Breadcrumb', () => {
  it('is a named navigation landmark holding an ordered list', () => {
    render(<Breadcrumb items={PATH} />);

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });

    expect(nav.querySelector('ol')).toBeTruthy();
  });

  it('links every crumb but the last', () => {
    render(<Breadcrumb items={PATH} />);

    const links = screen.getAllByRole('link');

    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/',
      '/?workspace=packages',
    ]);
  });

  it('marks the last crumb as the current page and never links it', () => {
    render(<Breadcrumb items={PATH} />);

    const current = screen.getByText('@gate/ui');

    expect(current.getAttribute('aria-current')).toBe('page');
    expect(current.closest('a')).toBeNull();
  });

  it('renders a crumb with no href as text', () => {
    render(<Breadcrumb items={[{ label: 'All layers' }, { label: 'Unit' }]} />);

    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('keeps the separators out of the accessible text', () => {
    const { container } = render(<Breadcrumb items={PATH} />);

    const separators = container.querySelectorAll('.ds-breadcrumb__separator');

    expect(separators).toHaveLength(2);
    separators.forEach((separator) =>
      expect(separator.getAttribute('aria-hidden')).toBe('true'),
    );
  });

  it('renders nothing for an empty path', () => {
    const { container } = render(<Breadcrumb items={[]} />);

    expect(container.firstChild).toBeNull();
  });
});
