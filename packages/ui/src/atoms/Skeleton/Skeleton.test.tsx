import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Skeleton } from './Skeleton';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(cleanup);

describe('Skeleton', () => {
  it('renders a line-variant shape by default', () => {
    const { container } = render(<Skeleton />);

    // Exact, not `toContain`: an omitted `className` must be filtered out rather
    // than joined in as a trailing empty or `undefined` class.
    expect(container.firstElementChild?.className).toBe('ds-skeleton ds-skeleton--line');
  });

  it('maps the block variant onto its modifier class', () => {
    const { container } = render(<Skeleton variant="block" />);

    expect(container.firstElementChild?.className).toBe('ds-skeleton ds-skeleton--block');
  });

  it('hides the decorative shape from the accessibility tree', () => {
    const { container } = render(<Skeleton />);

    // A placeholder carries no content, so a reader that reaches it announces an
    // empty box. The loading announcement belongs to the region being replaced.
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });

  it('appends a caller-supplied className', () => {
    const { container } = render(<Skeleton className="u-mt-4" />);

    expect(container.firstElementChild?.className).toBe(
      'ds-skeleton ds-skeleton--line u-mt-4',
    );
  });

  it('resolves an explicit width and height through their space tokens', () => {
    const { container } = render(<Skeleton variant="block" width={16} height={10} />);

    const shape = container.firstElementChild as HTMLElement;

    // Token references, never lengths: a raw `4rem` here would be a size no theme
    // can retune, which is what the escape hatch exists to prevent.
    expect(shape.style.width).toBe('var(--space-16)');
    expect(shape.style.height).toBe('var(--space-10)');
  });

  it('leaves width and height to the stylesheet when neither is given', () => {
    const { container } = render(<Skeleton />);

    const shape = container.firstElementChild as HTMLElement;

    expect(shape.style.width).toBe('');
    expect(shape.style.height).toBe('');
  });

  it('renders one shape per line when `lines` is given', () => {
    const { container } = render(<Skeleton lines={3} />);

    expect(container.querySelectorAll('.ds-skeleton')).toHaveLength(3);
  });

  it('hides every shape in a group from the accessibility tree', () => {
    const { container } = render(<Skeleton lines={3} />);

    const hidden = container.querySelectorAll('.ds-skeleton[aria-hidden="true"]');

    expect(hidden).toHaveLength(3);
  });

  it('appends a caller-supplied className to the group, not to its shapes', () => {
    const { container } = render(<Skeleton lines={2} className="u-mt-4" />);

    expect(container.firstElementChild?.className).toBe('ds-skeleton-group u-mt-4');
    expect(container.querySelectorAll('.ds-skeleton--line.u-mt-4')).toHaveLength(0);
  });

  it('applies an explicit width and height to each shape in a group', () => {
    const { container } = render(<Skeleton lines={2} width={12} height={2} />);

    const shapes = [...container.querySelectorAll<HTMLElement>('.ds-skeleton')];

    expect(shapes.map((shape) => shape.style.width)).toEqual([
      'var(--space-12)',
      'var(--space-12)',
    ]);
    expect(shapes.map((shape) => shape.style.height)).toEqual([
      'var(--space-2)',
      'var(--space-2)',
    ]);
  });

  it('renders nothing at all for `lines={0}`, not an empty group', () => {
    const { container } = render(<Skeleton lines={0} />);

    expect(container.firstElementChild).toBeNull();
  });
});
