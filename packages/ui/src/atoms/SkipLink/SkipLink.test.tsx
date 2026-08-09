import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SkipLink } from './SkipLink';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(cleanup);

describe('SkipLink', () => {
  it('renders an anchor to #main by default, labelled "Skip to content"', () => {
    render(<SkipLink />);

    const link = screen.getByRole('link', { name: 'Skip to content' });

    expect(link.getAttribute('href')).toBe('#main');
  });

  it('points at the id given via targetId', () => {
    render(<SkipLink targetId="content" />);

    const link = screen.getByRole('link', { name: 'Skip to content' });

    expect(link.getAttribute('href')).toBe('#content');
  });

  it('renders caller-supplied children in place of the default label', () => {
    render(<SkipLink>Skip navigation</SkipLink>);

    const link = screen.getByRole('link', { name: 'Skip navigation' });

    expect(link.textContent).toBe('Skip navigation');
  });

  // Edge case: hidden-until-focused is a styling concern, not a DOM one — the
  // link must stay queryable (and thus reachable by assistive tech and the
  // keyboard) whether or not it currently has focus.
  it('is queryable in the DOM without being focused', () => {
    render(<SkipLink />);

    const link = screen.getByRole('link', { name: 'Skip to content' });

    expect(document.activeElement).not.toBe(link);
    expect(document.body.contains(link)).toBe(true);
  });

  it('carries the visually-hidden utility and its own class', () => {
    render(<SkipLink />);

    const link = screen.getByRole('link', { name: 'Skip to content' });

    // Exact, not `toContain`: an omitted `className` must be filtered out
    // rather than joined in as a trailing empty or `undefined` class.
    expect(link.className).toBe('ds-visually-hidden ds-skip-link');
  });

  it('appends a caller-supplied className to the base classes', () => {
    render(<SkipLink className="u-mt-2" />);

    const link = screen.getByRole('link', { name: 'Skip to content' });

    expect(link.className).toBe('ds-visually-hidden ds-skip-link u-mt-2');
  });
});
