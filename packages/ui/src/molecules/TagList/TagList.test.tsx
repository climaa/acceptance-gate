import { cleanup, render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { TagList } from './TagList';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(cleanup);

// Stands in for `next/link`, which packages/ui may not depend on (see Tag.tsx).
function RouterLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a data-routed="true" {...props} />;
}

describe('TagList', () => {
  it('renders one link per tag inside a semantic list', () => {
    render(<TagList tags={['testing', 'agents', 'ci']} />);

    const list = screen.getByRole('list');
    const items = screen.getAllByRole('listitem');
    const links = screen.getAllByRole('link');

    expect(list.tagName).toBe('UL');
    expect(items).toHaveLength(3);
    expect(links.map((link) => link.textContent)).toEqual(['testing', 'agents', 'ci']);
  });

  it('builds each href with a caller-supplied hrefFor', () => {
    render(<TagList tags={['react']} hrefFor={(tag) => `/topics/${tag}`} />);

    const link = screen.getByRole('link', { name: 'react' });

    expect(link.getAttribute('href')).toBe('/topics/react');
  });

  it('percent-encodes each tag with the default href builder', () => {
    render(<TagList tags={['next js']} />);

    const link = screen.getByRole('link', { name: 'next js' });

    expect(link.getAttribute('href')).toBe('/tags/next%20js');
  });

  // Edge case: an empty tags array must render nothing at all, not an empty <ul>.
  it('renders nothing at all for an empty tags array', () => {
    const { container } = render(<TagList tags={[]} />);

    expect(container.firstChild).toBeNull();
  });

  it('forwards `as` straight through to each Tag', () => {
    render(<TagList tags={['react']} as={RouterLink} />);

    const link = screen.getByRole('link', { name: 'react' });

    expect(link.dataset.routed).toBe('true');
  });

  it('carries only the Stack and block classes when no className is supplied', () => {
    render(<TagList tags={['react']} />);

    const list = screen.getByRole('list');

    // Exact, not `toContain`: an omitted `className` must be filtered out rather
    // than joined in as a trailing empty or `undefined` class.
    expect(list.className).toBe('ds-stack ds-tag-list');
  });

  it('appends a caller-supplied className', () => {
    render(<TagList tags={['react']} className="u-mt-2" />);

    const list = screen.getByRole('list');

    expect(list.className).toBe('ds-stack ds-tag-list u-mt-2');
  });
});
