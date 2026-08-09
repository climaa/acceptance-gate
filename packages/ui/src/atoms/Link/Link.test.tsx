import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Link } from './Link';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(cleanup);

// Stands in for `next/link`, which packages/ui may not depend on (see Link.tsx).
// This is the shape the blog composes — a component of its own rendering an anchor.
function RouterLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a data-routed="true" {...props} />;
}

describe('Link', () => {
  it('renders an anchor carrying the default tone', () => {
    render(<Link href="/blog">Read more</Link>);

    const link = screen.getByRole('link', { name: 'Read more' });

    // Exact, not `toContain`: an omitted `className` must be filtered out
    // rather than joined in as a trailing empty or `undefined` class.
    expect(link.className).toBe('ds-link ds-link--default');
  });

  it('maps the muted tone onto its modifier class', () => {
    render(
      <Link href="/rss.xml" tone="muted">
        RSS
      </Link>,
    );

    const link = screen.getByRole('link', { name: 'RSS' });

    expect(link.className).toBe('ds-link ds-link--muted');
  });

  it('appends a caller-supplied className to the tone classes', () => {
    render(
      <Link className="u-mt-2" href="/blog">
        Read more
      </Link>,
    );

    const link = screen.getByRole('link', { name: 'Read more' });

    expect(link.className).toBe('ds-link ds-link--default u-mt-2');
  });

  it('forwards the remaining props to the anchor', () => {
    render(
      <Link href="https://example.com" rel="noreferrer" target="_blank">
        Read more
      </Link>,
    );

    const link = screen.getByRole('link', { name: 'Read more' });

    expect(link.getAttribute('href')).toBe('https://example.com');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noreferrer');
  });

  it('renders the component given as `as`, props and all', () => {
    render(
      <Link as={RouterLink} href="/blog">
        Read more
      </Link>,
    );

    const link = screen.getByRole('link', { name: 'Read more' });

    expect(link.dataset.routed).toBe('true');
    expect(link.getAttribute('href')).toBe('/blog');
    expect(link.className).toBe('ds-link ds-link--default');
  });

  it('renders element children rather than flattening them', () => {
    render(
      <Link href="/blog">
        <span>Read more</span>
      </Link>,
    );

    const link = screen.getByRole('link', { name: 'Read more' });

    expect(link.firstElementChild?.tagName).toBe('SPAN');
  });

  // Edge case: the polymorphic escape hatch must not smuggle an anchor-only
  // attribute onto an element that has no such attribute — `href` on a button is
  // invalid HTML and leaves the control unreachable by the link role.
  it('emits no href when rendered as a button', () => {
    render(
      <Link as="button" type="button">
        Read more
      </Link>,
    );

    const button = screen.getByRole('button', { name: 'Read more' });

    expect(button.hasAttribute('href')).toBe(false);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('forwards handlers to the element named by `as`', () => {
    const onClick = vi.fn();
    render(
      <Link as="button" onClick={onClick} type="button">
        Read more
      </Link>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Read more' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
