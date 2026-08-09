import type { ReactNode } from 'react';

export interface CodeBlockProps {
  /**
   * Highlighter language id (`ts`, `bash`, …). Rendered as the slab's label and
   * forwarded verbatim as `data-language` for the build-time rehype pipeline to
   * select on. Omitted entirely when absent — never an empty attribute.
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
  return (
    <div className={['ds-code', className].filter(Boolean).join(' ')}>
      {language ? <span className="ds-code__language">{language}</span> : null}
      <pre className="ds-code__pre" data-language={language}>
        <code>{children}</code>
      </pre>
    </div>
  );
}
