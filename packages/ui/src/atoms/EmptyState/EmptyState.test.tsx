import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { EmptyState } from './EmptyState';

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

  it('appends a caller-supplied className', () => {
    const { container } = render(<EmptyState message="No posts" className="u-mt-4" />);

    expect(container.querySelector('.ds-empty')?.className).toBe('ds-empty u-mt-4');
  });
});
