import type { ReactNode } from 'react';

import { Badge, type BadgeTone } from '../../atoms/Badge/Badge';
import { Meter, type MeterProps } from '../../atoms/Meter/Meter';

/**
 * Where a dimension's figure stands. `gaps` is a count of work left rather than
 * a measurement, so it carries no badge: the figure says it.
 */
export type StatTileState = 'measured' | 'gaps' | 'unmeasured' | 'not-applicable';

export interface StatTileProps {
  label: string;
  /** The figure as it is read: `98.9%`, `23`, `none`, `—`. */
  value: ReactNode;
  detail?: ReactNode;
  state: StatTileState;
  /** The bar under the figure. `value: null` draws the dashed, unmeasured track. */
  meter?: Omit<MeterProps, 'className'>;
  className?: string;
}

const BADGES: Record<StatTileState, { tone: BadgeTone; text: string } | null> = {
  measured: { tone: 'success', text: 'measured' },
  gaps: null,
  unmeasured: { tone: 'danger', text: 'unmeasured' },
  'not-applicable': { tone: 'dashed', text: 'n/a' },
};

export function statTileBadge(state: StatTileState) {
  return BADGES[state];
}

/** A dimension's figure with its state badge and Meter. */
export function StatTile({
  label,
  value,
  detail,
  state,
  meter,
  className,
}: StatTileProps) {
  const badge = statTileBadge(state);

  return (
    <div
      className={['ds-stat-tile', `ds-stat-tile--${state}`, className]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="ds-stat-tile__header">
        <span className="ds-stat-tile__label">{label}</span>
        {badge && <Badge tone={badge.tone}>{badge.text}</Badge>}
      </div>
      <p className="ds-stat-tile__value">{value}</p>
      {detail !== undefined && <p className="ds-stat-tile__detail">{detail}</p>}
      {meter && <Meter {...meter} className="ds-stat-tile__meter" />}
    </div>
  );
}
