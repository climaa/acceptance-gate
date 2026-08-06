import type { ReactNode } from 'react';

export interface StatTileProps {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
}

/** Métrica única: número grande + etiqueta. Para filas de KPIs. */
export function StatTile({ label, value, hint, tone = 'neutral' }: StatTileProps) {
  return (
    <div className={['ds-stat', `ds-stat--${tone}`].join(' ')}>
      <span className="ds-stat__value">{value}</span>
      <span className="ds-stat__label">{label}</span>
      {hint && <span className="ds-stat__hint">{hint}</span>}
    </div>
  );
}
