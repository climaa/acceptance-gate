import type { ReactNode } from 'react';

/** Envoltorio tipográfico para contenido largo (MDX del blog). */
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={['ds-prose', className].filter(Boolean).join(' ')}>{children}</div>;
}
