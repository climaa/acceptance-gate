import { ALL_VIEWPORTS_TAG } from '@gate/visual-diff/policy';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CodeBlock } from './CodeBlock';
import meta from './CodeBlock.stories';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(cleanup);

describe('CodeBlock', () => {
  it('renders its children inside a <pre><code>', () => {
    const { container } = render(<CodeBlock>{'const x = 1;'}</CodeBlock>);

    const code = container.querySelector('pre > code');

    expect(code).not.toBeNull();
    expect(code?.textContent).toBe('const x = 1;');
  });

  it('carries only the block class when no className is supplied', () => {
    const { container } = render(<CodeBlock>{'const x = 1;'}</CodeBlock>);

    // Exact, not `toContain`: an omitted `className` must be filtered out rather
    // than joined in as a trailing empty or `undefined` class.
    expect(container.firstElementChild?.className).toBe('ds-code');
  });

  it('appends a caller-supplied className', () => {
    const { container } = render(
      <CodeBlock className="u-mt-2">{'const x = 1;'}</CodeBlock>,
    );

    expect(container.firstElementChild?.className).toBe('ds-code u-mt-2');
  });

  it('renders `language` as a label', () => {
    render(<CodeBlock language="typescript">{'const x = 1;'}</CodeBlock>);

    // The label is real text, not `aria-hidden` decoration: which language a
    // slab is written in is content, and a listener gets it the way a reader does.
    screen.getByText('typescript');
  });

  it('forwards `language` to data-language on the <pre>', () => {
    // The rehype-pretty-code pipeline (a blog-track issue) styles its token
    // spans against this attribute, so it has to sit on their ancestor.
    const { container } = render(
      <CodeBlock language="typescript">{'const x = 1;'}</CodeBlock>,
    );

    const pre = container.querySelector('pre');

    expect(pre?.getAttribute('data-language')).toBe('typescript');
  });

  // Structural, not appearance: that the slab scrolls is `overflow-x: auto` in
  // CodeBlock.css and belongs to the differ, but whether the scrolling region can
  // be reached at all is a DOM fact pixels cannot show. axe reports the rendered
  // verdict (`scrollable-region-focusable`, WCAG 2.1.1) from the acceptance suite;
  // this pins the attribute that satisfies it so it cannot be dropped silently.
  it('makes the scrollable slab reachable from the keyboard', () => {
    const { container } = render(
      <CodeBlock language="typescript">{'const x = 1;'}</CodeBlock>,
    );

    const pre = container.querySelector('pre');

    expect(pre?.getAttribute('tabindex')).toBe('0');
  });

  it('stays focusable when no language is given', () => {
    // The tab stop follows the overflow, and the overflow is on every slab —
    // tying it to `language` instead would leave unlabelled blocks unreachable.
    const { container } = render(<CodeBlock>{'const x = 1;'}</CodeBlock>);

    expect(container.querySelector('pre')?.getAttribute('tabindex')).toBe('0');
  });

  it('renders no label and no data-language attribute when `language` is omitted', () => {
    const { container } = render(<CodeBlock>{'const x = 1;'}</CodeBlock>);

    const pre = container.querySelector('pre');

    // `hasAttribute`, not a falsy value check: `data-language=""` would match a
    // `[data-language]` selector and hand the pipeline an empty language.
    expect(pre?.hasAttribute('data-language')).toBe(false);
    expect(container.querySelector('.ds-code__language')).toBeNull();
  });

  it('treats an empty `language` as an absent one', () => {
    const { container } = render(<CodeBlock language="">{'const x = 1;'}</CodeBlock>);

    const pre = container.querySelector('pre');

    expect(pre?.hasAttribute('data-language')).toBe(false);
    expect(container.querySelector('.ds-code__language')).toBeNull();
  });

  it('renders already-highlighted markup unchanged', () => {
    // Highlighting is rehype-pretty-code's job at build time; this component
    // renders whatever markup it is handed, so element children must survive
    // with their tags, classes and order intact rather than be flattened to text.
    const { container } = render(
      <CodeBlock language="ts">
        <span className="token-keyword">const</span>
        <span className="token-name"> x</span>
      </CodeBlock>,
    );

    const spans = container.querySelectorAll('pre > code > span');

    expect([...spans].map((span) => span.className)).toEqual([
      'token-keyword',
      'token-name',
    ]);
    expect(container.querySelector('code')?.textContent).toBe('const x');
  });

  it('keeps a long unbroken line intact in the DOM', () => {
    // The component may not wrap, truncate or ellipsize the code it is given —
    // whatever fits on screen is the stylesheet's business, but the source text
    // has to survive verbatim so a copy out of the page still compiles.
    const line = `const x = ${'a'.repeat(400)};`;

    const { container } = render(<CodeBlock>{line}</CodeBlock>);

    expect(container.querySelector('code')?.textContent).toBe(line);
  });
});

/**
 * The capture contract, the mirror of the `visual-diff:skip` blocks on
 * SkipLink and TagList: this component reflows with width, so its stories are
 * captured at every viewport rather than at the one its tier promises.
 *
 * Asserted on the meta, not on a story. Storybook merges a meta's tags into
 * every story it holds, which is the point — `LongLine` is where the overflow claim is load-bearing, and the two short
 * stories are what say the mobile box is right when nothing overflows.
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
