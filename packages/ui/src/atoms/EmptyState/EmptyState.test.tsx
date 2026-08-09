import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { EmptyState } from './EmptyState';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(cleanup);

describe('EmptyState', () => {
  it('renders the message', () => {
    render(<EmptyState message="No posts for this tag" />);

    expect(screen.getByText('No posts for this tag')).toBeTruthy();
  });

  it('renders the icon slot when given', () => {
    render(<EmptyState message="No posts" icon={<svg data-testid="icon" />} />);

    expect(screen.getByTestId('icon')).toBeTruthy();
  });

  it('renders the action slot when given', () => {
    render(<EmptyState message="No posts" action={<button>Clear filter</button>} />);

    expect(screen.getByRole('button', { name: 'Clear filter' })).toBeTruthy();
  });

  it('renders no icon or action wrapper elements when neither is given', () => {
    const { container } = render(<EmptyState message="No posts" />);

    expect(container.querySelector('.ds-empty__icon')).toBeNull();
    expect(container.querySelector('.ds-empty__action')).toBeNull();
  });

  it('carries only the block class when no className is supplied', () => {
    const { container } = render(<EmptyState message="No posts" />);

    // Exact, not `toContain`: an omitted `className` must be filtered out rather
    // than joined in as a trailing empty or `undefined` class.
    expect(container.firstElementChild?.className).toBe('ds-empty');
  });

  it('appends a caller-supplied className', () => {
    const { container } = render(<EmptyState message="No posts" className="u-mt-4" />);

    expect(container.firstElementChild?.className).toBe('ds-empty u-mt-4');
  });
});
