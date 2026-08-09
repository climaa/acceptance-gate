import type { ReactNode } from 'react';

/** Typographic wrapper for long-form content (the blog’s MDX). */
export function Prose({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={['ds-prose', className].filter(Boolean).join(' ')}>{children}</div>
  );
}
