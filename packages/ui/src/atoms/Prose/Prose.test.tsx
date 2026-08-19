import { ALL_VIEWPORTS_TAG } from '@gate/visual-diff/policy';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Prose } from './Prose';
import meta from './Prose.stories';

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

/**
 * The capture contract, the mirror of the `visual-diff:skip` blocks on
 * SkipLink and TagList: this component reflows with width, so its stories are
 * captured at every viewport rather than at the one its tier promises.
 *
 * Asserted on the meta, not on a story. Storybook merges a meta's tags into
 * every story it holds, which is the point — the narrow width is the only one where the table's `overflow-x` scroll
 * container is doing anything at all.
 *
 * Equality against the imported constant, because the story file must write the
 * literal (CSF is indexed statically and rejects a non-literal tag), and a
 * literal is exactly what goes stale. `src/__tests__/viewport-contract.test.ts`
 * is the other half: it is what notices a component that grows a breakpoint and
 * never gets a tag at all.
 */
describe('the capture contract', () => {
  it('is captured at every viewport, with the string policy.mjs declares', () => {
    expect(meta.tags).toEqual([ALL_VIEWPORTS_TAG]);
  });
});
