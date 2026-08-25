import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Spinner } from './Spinner';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(cleanup);

describe('Spinner', () => {
  it('renders one span', () => {
    const { container } = render(<Spinner />);

    expect(container.firstElementChild?.tagName).toBe('SPAN');
  });

  it('renders the base class alone when no className is given', () => {
    const { container } = render(<Spinner />);

    // Exact, not `toContain`: an omitted `className` must be filtered out rather
    // than joined in as a trailing empty or `undefined` class.
    expect(container.firstElementChild?.className).toBe('ds-spinner');
  });

  it('appends a caller-supplied className after the base class', () => {
    const { container } = render(<Spinner className="u-mt-2" />);

    expect(container.firstElementChild?.className).toBe('ds-spinner u-mt-2');
  });

  it('hides the ring from the accessibility tree', () => {
    const { container } = render(<Spinner />);

    // The fact it draws is written in words beside it, inside a live region that
    // announces once. A ring of its own would announce the same thing twice.
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });

  it('announces nothing of its own — no status, no alert', () => {
    render(<Spinner />);

    // The edge case worth naming: a live region here would nest inside the one
    // its consumer already has, and `role="alert"` would break every acceptance
    // scenario that reads refusals through the console's single alert locator.
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
