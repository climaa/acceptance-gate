import { compile, run } from '@mdx-js/mdx';
import { createElement } from 'react';
import * as runtime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * Pins the lossless-extraction assumption behind `textOfNode` (lib/mdx.tsx).
 *
 * A ```mermaid fence reaches `Pre` already tokenized by rehype-pretty-code,
 * and the raw diagram source is reconstructed by concatenating the token text.
 * That only works while shiki wraps text without rewriting it — an assumption
 * about the exact-pinned highlighter's output shape, not about our own code.
 * This suite compiles a fence through the REAL pipeline and asserts the chart
 * that reaches the component equals the fence body, so a future highlighter
 * bump that starts mangling text fails here instead of shipping broken
 * diagrams.
 *
 * Lives apart from content.test.ts because it mocks MermaidDiagram, and a
 * module mock would leak into that suite's graceful-degradation cases.
 */

const captured = vi.hoisted(() => ({ charts: [] as string[] }));

vi.mock('../components/MermaidDiagram', () => ({
  MermaidDiagram: ({ chart }: { chart: string }) => {
    captured.charts.push(chart);
    return null;
  },
}));

// Imported after the mock so lib/mdx.tsx binds to the capturing stub.
import { mdxComponents, rehypePlugins, textOfNode } from '../lib/mdx';

// Every construct the real post's diagrams use that could plausibly not
// round-trip through the highlighter: a subgraph, a {decision?} node,
// `-- yes -->` edge labels, and `<br/>` inside a quoted label (literal text in
// a fence — MDX must not parse it as JSX).
const CHART = `flowchart TB
  start([pnpm sandcastle]) --> pre{"Preflight:<br/>gh on PATH?"}

  subgraph loop [One issue at a time]
    plan[Plan] --> impl[Implement]
  end

  pre -- yes --> loop
  pre -- no --> stop(["Refuse to start"])`;

const FENCE = '```mermaid\n' + CHART + '\n```\n';

async function renderMdx(source: string): Promise<string> {
  const compiled = await compile(source, {
    outputFormat: 'function-body',
    rehypePlugins,
  });
  const { default: Content } = await run(compiled, runtime);

  return renderToStaticMarkup(createElement(Content, { components: mdxComponents }));
}

describe('mermaid chart extraction', () => {
  // "Lossless" has exactly one asterisk: rehype-pretty-code pads a blank line
  // with whitespace so the line keeps its height in the rendered block. Mermaid
  // ignores whitespace-only lines, so the padding is left in the chart rather
  // than stripped at runtime — but every line that carries content must come
  // through character for character.
  it('hands the component every content line, character for character', async () => {
    await renderMdx(FENCE);

    expect(captured.charts).toHaveLength(1);

    const received = captured.charts[0]!.split('\n');
    const expected = CHART.split('\n');

    expect(received).toHaveLength(expected.length);
    received.forEach((line, i) => {
      if (expected[i] === '') {
        expect(line).toMatch(/^\s*$/);
      } else {
        expect(line).toBe(expected[i]);
      }
    });
  });
});

describe('textOfNode', () => {
  it('concatenates strings across nested elements and arrays', () => {
    const tree = createElement('span', null, 'a --> ', [
      createElement('span', { key: 'b' }, 'b'),
      '\n',
    ]);

    expect(textOfNode(tree)).toBe('a --> b\n');
  });

  it('renders non-text leaves as nothing, matching React', () => {
    expect(textOfNode(null)).toBe('');
    expect(textOfNode(undefined)).toBe('');
    expect(textOfNode(true)).toBe('');
  });
});
