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
      {/*
        `tabIndex={0}` because the slab scrolls: `.ds-code__pre` carries
        `overflow-x: auto`, and a region that scrolls but cannot be focused is
        unreachable for anyone driving the page from the keyboard — WCAG 2.1.1,
        and axe's `scrollable-region-focusable`. It is unconditional because
        whether a given block overflows is a runtime measurement this component
        cannot make, and a tab stop on a block that happens to fit costs a
        keystroke while the missing one costs the content. The focus ring comes
        from base.css's `:where(:focus-visible)`, so it needs no styling here.
      */}
      <pre className="ds-code__pre" data-language={languageId} tabIndex={0}>
        <code>{children}</code>
      </pre>
    </div>
  );
}
