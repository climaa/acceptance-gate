import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button } from './Button';

// `globals` is off in vitest.config.ts, so Testing Library never sees a global
// `afterEach` to hook its automatic cleanup onto — without this, every render
// stacks in the same document and `getByRole` throws on the second test.
afterEach(cleanup);

describe('Button', () => {
  it('renders the primary variant at the default size', () => {
    render(<Button>Save</Button>);

    const button = screen.getByRole('button', { name: 'Save' });

    // Exact, not `toContain`: an omitted `className` must be filtered out
    // rather than joined in as a trailing empty or `undefined` class.
    expect(button.className).toBe('ds-btn ds-btn--primary ds-btn--md');
  });

  it('renders the secondary variant when asked for it', () => {
    render(<Button variant="secondary">Cancel</Button>);

    const button = screen.getByRole('button', { name: 'Cancel' });

    expect(button.className).toContain('ds-btn--secondary');
  });

  it('forwards `disabled` to the underlying button', () => {
    render(<Button disabled>Save</Button>);

    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Save' });

    expect(button.disabled).toBe(true);
  });

  it('appends a caller-supplied className to the variant classes', () => {
    render(<Button className="u-mt-2">Save</Button>);

    const button = screen.getByRole('button', { name: 'Save' });

    expect(button.className).toContain('ds-btn--primary');
    expect(button.className).toContain('u-mt-2');
  });

  it('fires onClick when enabled', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onClick).not.toHaveBeenCalled();
  });
});
