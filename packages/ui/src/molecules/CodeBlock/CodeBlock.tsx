import type { ReactNode } from 'react';

export interface CodeBlockProps {
  /**
   * Highlighter language id (`ts`, `bash`, …). Rendered as the slab's label and
   * forwarded verbatim as `data-language` for the build-time rehype pipeline to
   * select on. Omitted entirely when absent or empty — never a blank attribute.
   */
  language?: string;
  /**
   * The code. Already-highlighted markup passes through untouched: this
   * component renders what it is given and highlights nothing itself, because
   * `rehype-pretty-code` does that at build time and a second highlighter here
   * would fight it.
   */
  children: ReactNode;
  className?: string;
}

export function CodeBlock({ language, children, className }: CodeBlockProps) {
  // Normalised once so the label and the attribute can never disagree: an empty
  // string still renders `data-language=""`, which matches a `[data-language]`
  // selector and hands the rehype pipeline a blank language id.
  const languageId = language || undefined;

  return (
    <div className={['ds-code', className].filter(Boolean).join(' ')}>
      {languageId ? <span className="ds-code__language">{languageId}</span> : null}
      <pre className="ds-code__pre" data-language={languageId}>
        <code>{children}</code>
      </pre>
    </div>
  );
}
