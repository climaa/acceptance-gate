import type { CSSProperties, ElementType, ReactNode } from 'react';

type Space = 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16;

export interface StackProps {
  direction?: 'row' | 'column';
  gap?: Space;
  align?: CSSProperties['alignItems'];
  justify?: CSSProperties['justifyContent'];
  wrap?: boolean;
  as?: ElementType;
  className?: string;
  children: ReactNode;
}

/** Primitiva de layout: la única forma permitida de crear espacio entre elementos. */
export function Stack({
  direction = 'column',
  gap = 4,
  align,
  justify,
  wrap = false,
  as: Tag = 'div',
  className,
  children,
}: StackProps) {
  return (
    <Tag
      className={['ds-stack', className].filter(Boolean).join(' ')}
      style={{
        flexDirection: direction,
        gap: `var(--space-${gap})`,
        alignItems: align,
        justifyContent: justify,
        flexWrap: wrap ? 'wrap' : 'nowrap',
      }}
    >
      {children}
    </Tag>
  );
}
