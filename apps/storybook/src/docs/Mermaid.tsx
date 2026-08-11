import { useEffect, useId, useState } from 'react';
import mermaid from 'mermaid';

// 'neutral', not 'dark': the docs page chrome is light regardless of the story
// preview's own theme toggle, and 'dark' put dark node fills under dark text —
// readable in neither of this design system's two themes, only in Storybook's.
mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' });

export interface MermaidProps {
  /** The diagram source, in Mermaid's own syntax. */
  chart: string;
}

/**
 * Renders a Mermaid diagram to inline SVG at doc-render time.
 *
 * Storybook's MDX pipeline has no build-time Mermaid support — a fenced
 * ```mermaid block renders as a plain code sample, not a diagram. This is the
 * doc-time equivalent: `mermaid.render()` produces the SVG string once the
 * component mounts, and the id has to be unique per instance or two diagrams
 * on the same page collide in mermaid's own internal registry.
 */
export function Mermaid({ chart }: MermaidProps) {
  const reactId = useId().replace(/:/g, '');
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    mermaid.render(`mermaid-${reactId}`, chart).then(({ svg: rendered }) => {
      if (!cancelled) setSvg(rendered);
    });

    return () => {
      cancelled = true;
    };
  }, [chart, reactId]);

  if (!svg) return null;

  return <div dangerouslySetInnerHTML={{ __html: svg }} />;
}
