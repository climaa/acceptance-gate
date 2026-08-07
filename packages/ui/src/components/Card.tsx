import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds the standard inner padding. */
  padded?: boolean;
  /** Realza con sombra al hacer hover — para tarjetas clicables. */
  interactive?: boolean;
  children: ReactNode;
}

export function Card({
  padded = true,
  interactive = false,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={[
        'ds-card',
        padded && 'ds-card--padded',
        interactive && 'ds-card--interactive',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={['ds-card__header', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3 className={['ds-card__title', className].filter(Boolean).join(' ')}>
      {children}
    </h3>
  );
}
