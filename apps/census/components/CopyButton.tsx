'use client';

import type { ReactNode } from 'react';

export interface CopyButtonProps {
  text: string;
  className?: string;
  /** What the button says; the text itself when absent. */
  children?: ReactNode;
  label?: string;
}

/** Copies `text` to the clipboard: a gap's title as an issue title, or the Markdown export. */
export function CopyButton({ text, className, children, label }: CopyButtonProps) {
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      title={label}
      onClick={() => void navigator.clipboard?.writeText(text)}
    >
      {children ?? text}
    </button>
  );
}
