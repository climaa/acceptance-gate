import { cleanup, render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Tag } from './Tag';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(cleanup);

// Stands in for `next/link`, which packages/ui may not depend on (see Tag.tsx).
// This is the shape the blog composes — a component of its own rendering an anchor.
function RouterLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a data-routed="true" {...props} />;
}

describe('Tag', () => {
  it('renders an anchor carrying only the ds-tag class by default', () => {
    render(<Tag href="/tags/react">react</Tag>);

    const tag = screen.getByRole('link', { name: 'react' });

    expect(tag.tagName).toBe('A');
    // Exact, not `toContain`: an omitted `className` must be filtered out
    // rather than joined in as a trailing empty or `undefined` class.
    expect(tag.className).toBe('ds-tag');
  });

  it('appends a caller-supplied className to the base class', () => {
    render(
      <Tag className="u-mt-2" href="/tags/react">
        react
      </Tag>,
    );

    const tag = screen.getByRole('link', { name: 'react' });

    expect(tag.className).toBe('ds-tag u-mt-2');
  });

  it('forwards href to the anchor', () => {
    render(<Tag href="/tags/react">react</Tag>);

    const tag = screen.getByRole('link', { name: 'react' });

    expect(tag.getAttribute('href')).toBe('/tags/react');
  });

  it('renders the component given as `as`, props and all', () => {
    render(
      <Tag as={RouterLink} href="/tags/react">
        react
      </Tag>,
    );

    const tag = screen.getByRole('link', { name: 'react' });

    expect(tag.dataset.routed).toBe('true');
    expect(tag.getAttribute('href')).toBe('/tags/react');
    expect(tag.className).toBe('ds-tag');
  });

  // Edge case: slug construction is the caller's job, not this atom's — a label
  // containing a space or slash must render verbatim.
  it('renders a label containing a space or slash verbatim', () => {
    render(<Tag href="/tags/next-js">next js/beta</Tag>);

    const tag = screen.getByRole('link', { name: 'next js/beta' });

    expect(tag.textContent).toBe('next js/beta');
  });
});
