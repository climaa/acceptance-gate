import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Prose } from './Prose';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(cleanup);

describe('Prose', () => {
  it('wraps its children in a .ds-prose div', () => {
    render(<Prose>Long-form copy.</Prose>);

    const prose = screen.getByText('Long-form copy.');

    // A block-level wrapper is the contract: `.ds-prose` nests headings, lists and
    // `pre` blocks, none of which an inline or `<p>` wrapper may legally contain.
    expect(prose.tagName).toBe('DIV');
  });

  it('carries only the ds-prose class when no className is given', () => {
    render(<Prose>Long-form copy.</Prose>);

    const prose = screen.getByText('Long-form copy.');

    // Exact, not `toContain`: an omitted `className` must be filtered out
    // rather than joined in as a trailing empty or `undefined` class.
    expect(prose.className).toBe('ds-prose');
  });

  it('appends a caller-supplied className', () => {
    render(<Prose className="u-mt-2">Long-form copy.</Prose>);

    const prose = screen.getByText('Long-form copy.');

    expect(prose.className).toBe('ds-prose u-mt-2');
  });

  it('renders element children rather than flattening them', () => {
    render(
      <Prose>
        <h2>Heading</h2>
      </Prose>,
    );

    const heading = screen.getByRole('heading', { name: 'Heading' });

    expect(heading.parentElement?.className).toBe('ds-prose');
  });
});
