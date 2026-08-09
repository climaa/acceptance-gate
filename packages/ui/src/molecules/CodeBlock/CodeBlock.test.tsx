import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CodeBlock } from './CodeBlock';

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
