import { compile, run } from '@mdx-js/mdx';
import { createElement } from 'react';
import * as runtime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import remarkGfm from 'remark-gfm';
import { describe, expect, it } from 'vitest';

import { mdxComponents } from '../lib/mdx';

/**
 * A pipe table is the only element a post author can write whose rendered width
 * the prose column does not constrain. Without a scroll container the overflow
 * lands on the page: `document.documentElement.scrollWidth` exceeds the
 * viewport and the whole article scrolls sideways, which on a phone is the
 * difference between an unreadable post and a readable one.
 *
 * These assert the wrapper is present and shaped correctly. What they cannot
 * assert is that it *looks* right — rendered appearance is visual-diff's job,
 * and CODING_STANDARDS is explicit that a test parsing a stylesheet to prove a
 * pixel is a proxy that drifts from the render. So the structural contract is
 * pinned here and the pixels are left where they belong.
 */

const TABLE = ['| Workflow | Runs |', '| --- | --- |', '| `pr` | 189 |'].join('\n');

async function renderMdx(source: string): Promise<string> {
  const compiled = await compile(source, {
    outputFormat: 'function-body',
    remarkPlugins: [remarkGfm],
  });
  const { default: Content } = await run(compiled, {
    ...runtime,
    baseUrl: import.meta.url,
  });
  return renderToStaticMarkup(createElement(Content, { components: mdxComponents }));
}

describe('a table in a post', () => {
  it('is wrapped in a scroll container', async () => {
    const html = await renderMdx(TABLE);

    expect(html).toContain('class="ds-scroll-x"');
    // The wrapper is outside, not inside: a container nested within the element
    // it is meant to scroll would clip nothing.
    expect(html.indexOf('ds-scroll-x')).toBeLessThan(html.indexOf('<table'));
  });

  // WCAG 2.1.1. A scroll container that only a pointer can reach strands
  // keyboard and switch users at whatever the first column happens to be, and
  // an unnamed tabstop is a stop a screen reader announces as nothing at all.
  it('can be reached and named without a mouse', async () => {
    const html = await renderMdx(TABLE);

    expect(html).toMatch(/<div[^>]*\btabindex="0"/);
    expect(html).toMatch(/<div[^>]*\brole="region"/);
    expect(html).toMatch(/<div[^>]*\baria-label="[^"]+"/);
  });

  // The table itself must come through untouched. Its own roles are load-bearing
  // for the acceptance suite, which locates rows and cells through them.
  it('leaves the table element and its semantics alone', async () => {
    const html = await renderMdx(TABLE);

    expect(html).toContain('<table>');
    expect(html).toContain('<thead>');
    expect(html).toContain('<th>Workflow</th>');
    expect(html).toContain('<td>');
  });
});
