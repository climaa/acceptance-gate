import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Stack } from './Stack';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(cleanup);

describe('Stack', () => {
  it('renders a div carrying only the ds-stack class by default', () => {
    render(<Stack>content</Stack>);

    const stack = screen.getByText('content');

    expect(stack.tagName).toBe('DIV');
    // Exact, not `toContain`: an omitted `className` must be filtered out
    // rather than joined in as a trailing empty or `undefined` class.
    expect(stack.className).toBe('ds-stack');
  });

  it('stacks in a column by default', () => {
    render(<Stack>content</Stack>);

    const stack = screen.getByText('content');

    expect(stack.style.flexDirection).toBe('column');
  });

  it('lays out in a row when asked for one', () => {
    render(<Stack direction="row">content</Stack>);

    const stack = screen.getByText('content');

    expect(stack.style.flexDirection).toBe('row');
  });

  it('uses the step-4 space token by default', () => {
    render(<Stack>content</Stack>);

    const stack = screen.getByText('content');

    // The gap is a token reference, never a length: a raw `1rem` here would be
    // spacing that no theme can retune.
    expect(stack.style.gap).toBe('var(--space-4)');
  });

  it('maps the gap step onto its space token', () => {
    render(<Stack gap={10}>content</Stack>);

    const stack = screen.getByText('content');

    expect(stack.style.gap).toBe('var(--space-10)');
  });

  it('does not wrap by default', () => {
    render(<Stack>content</Stack>);

    const stack = screen.getByText('content');

    // `nowrap` is written out rather than left unset, so a stylesheet rule on
    // `.ds-stack` cannot flip the default out from under the component.
    expect(stack.style.flexWrap).toBe('nowrap');
  });

  it('wraps when wrap is set', () => {
    render(<Stack wrap>content</Stack>);

    const stack = screen.getByText('content');

    expect(stack.style.flexWrap).toBe('wrap');
  });

  it('passes align and justify through to the flex properties', () => {
    render(
      <Stack align="center" justify="space-between">
        content
      </Stack>,
    );

    const stack = screen.getByText('content');

    expect(stack.style.alignItems).toBe('center');
    expect(stack.style.justifyContent).toBe('space-between');
  });

  it('leaves align and justify unset when they are not given', () => {
    render(<Stack>content</Stack>);

    const stack = screen.getByText('content');

    expect(stack.style.alignItems).toBe('');
    expect(stack.style.justifyContent).toBe('');
  });

  it('renders the element named by `as`', () => {
    render(<Stack as="section">content</Stack>);

    const stack = screen.getByText('content');

    expect(stack.tagName).toBe('SECTION');
  });

  it('appends a caller-supplied className', () => {
    render(<Stack className="u-mt-2">content</Stack>);

    const stack = screen.getByText('content');

    expect(stack.className).toBe('ds-stack u-mt-2');
  });
});
