'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';

/**
 * Mermaid's `base` theme derives its whole palette from a handful of seed
 * variables, so seeding them from the design tokens is what keeps a diagram on
 * theme without a single hardcoded colour. Read via `getComputedStyle` at draw
 * time — not module time — because the same tokens resolve to different values
 * under `[data-theme='dark']`, and a diagram drawn once would keep the palette
 * of whichever theme happened to be active at mount.
 */
function themeVariablesFromTokens(): Record<string, string> {
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string) => styles.getPropertyValue(name).trim();

  const bg = token('--color-bg');
  const fill = token('--color-bg-subtle');
  const border = token('--color-border');
  const text = token('--color-text');

  return {
    background: bg,
    primaryColor: fill,
    mainBkg: fill,
    primaryBorderColor: border,
    nodeBorder: border,
    primaryTextColor: text,
    nodeTextColor: text,
    textColor: text,
    // Edges need more contrast than a hairline border tone carries.
    lineColor: token('--color-border-strong'),
    // Subgraph plates sit on the page ground so their member nodes, filled
    // with --color-bg-subtle, stay visible against them.
    clusterBkg: bg,
    clusterBorder: border,
    edgeLabelBackground: bg,
    titleColor: token('--color-accent'),
  };
}

/**
 * The import stays dynamic because `content.test.ts` imports the components
 * map under vitest's node environment, where mermaid's module-load DOM access
 * would throw before a single test ran. It also keeps mermaid's weight out of
 * the route bundle for readers who never scroll to a diagram.
 */
async function drawChart(id: string, chart: string): Promise<string> {
  const { default: mermaid } = await import('mermaid');

  // Re-initialised on every draw, not once per module: the themeVariables are
  // a snapshot of the tokens, and each theme flip needs a fresh one.
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    themeVariables: themeVariablesFromTokens(),
    fontFamily: getComputedStyle(document.documentElement)
      .getPropertyValue('--font-sans')
      .trim(),
    // Mermaid's default fits the SVG to its container, which SHRINKS a wide
    // flowchart — text and all — until it fits the prose column: illegible on
    // desktop, worse on a phone. Drawn at natural size instead, the labels
    // stay at their designed size and `.mermaid-diagram`'s overflow-x takes
    // over when the column is narrower than the diagram.
    flowchart: { useMaxWidth: false },
    sequence: { useMaxWidth: false },
  });

  const { svg } = await mermaid.render(id, chart);
  return svg;
}

export interface MermaidDiagramProps {
  /** The diagram source, in Mermaid's own syntax. */
  chart: string;
  /** The highlighted code block, shown until — and unless — the SVG lands. */
  children: ReactNode;
}

/**
 * Renders a ```mermaid fence as an inline SVG diagram, on the client.
 *
 * The server never renders mermaid: effects do not run under
 * `renderToStaticMarkup` or RSC, so SSR emits the highlighted code block the
 * pipeline already produced. That is the graceful-degradation contract — a
 * reader without JavaScript, a crawler, or a diagram with a syntax error all
 * get legible highlighted source, never a blank hole.
 *
 * Theme switching is `[data-theme]` on the root element (never
 * `prefers-color-scheme` — CODING_STANDARDS), and light is the attribute's
 * ABSENCE, so the observer watches the attribute itself: add, change and
 * remove all trigger a redraw with freshly computed tokens. The swap from
 * code block to SVG is an instant replace — no entry animation, per the
 * no-animate-on-mount rule.
 */
export function MermaidDiagram({ chart, children }: MermaidDiagramProps) {
  // Unique per instance or two diagrams on one page collide in mermaid's
  // internal registry; colons stripped because mermaid puts the id in a
  // CSS selector.
  const reactId = useId().replace(/:/g, '');
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${reactId}`;

    const draw = () => {
      drawChart(id, chart)
        .then((rendered) => {
          if (!cancelled) setSvg(rendered);
        })
        .catch(() => {
          // A parse error strands mermaid's scratch container — id `d${id}`,
          // the `d` prefix is mermaid's own — in the DOM; remove it (and the
          // error SVG, which takes the bare id) and keep whatever is currently
          // shown: the highlighted fallback on first draw, the previous SVG on
          // a redraw.
          document.getElementById(id)?.remove();
          document.getElementById(`d${id}`)?.remove();
        });
    };

    draw();

    const observer = new MutationObserver(draw);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [chart, reactId]);

  if (!svg) return <>{children}</>;

  // role="img" with a label: the SVG mermaid emits is presentational soup to
  // assistive tech, and the blog's pages run under axe in the e2e suite.
  return (
    <div
      className="mermaid-diagram"
      role="img"
      aria-label="Diagram"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
