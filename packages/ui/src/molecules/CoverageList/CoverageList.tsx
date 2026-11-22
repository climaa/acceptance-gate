import type { ReactNode } from 'react';

import { Badge } from '../../atoms/Badge/Badge';
import { Meter, type MeterHue } from '../../atoms/Meter/Meter';
import { deltaTone, formatDelta } from '../SparkStat/SparkStat';

/** Census's four dimensions, each drawn in its own chart hue. */
export type CoverageDimension = 'code' | 'visual' | 'acceptance' | 'health';

export interface CoverageRow {
  dimension: CoverageDimension;
  name: string;
  /** What the figure counts: `37 of 49 with story · tile · baseline`. */
  detail?: ReactNode;
  /** 0–100: the share of the repository the dimension covers. */
  value: number;
  /** The change over the window, in percentage points. None until there is history. */
  delta?: number;
}

export interface CoverageListProps {
  title: string;
  description?: ReactNode;
  rows: CoverageRow[];
  /** The window every delta spans, as read after it: `30 d`. */
  window?: string;
  className?: string;
}

const HUES: Record<CoverageDimension, MeterHue> = {
  code: 'chart',
  visual: 'chart-2',
  acceptance: 'chart-3',
  health: 'chart-4',
};

export function dimensionHue(dimension: CoverageDimension): MeterHue {
  return HUES[dimension];
}

export function formatCoverage(value: number): string {
  return `${Math.round(Math.min(100, Math.max(0, value)))}%`;
}

export function formatPointsDelta(delta: number, window?: string): string {
  const points = `${formatDelta(delta)} pts`;
  return window ? `${points} · ${window}` : points;
}

/** The repository's coverage, one Meter row per dimension. */
export function CoverageList({
  title,
  description,
  rows,
  window,
  className,
}: CoverageListProps) {
  return (
    <section className={['ds-coverage-list', className].filter(Boolean).join(' ')}>
      <header className="ds-coverage-list__heading">
        <p className="ds-coverage-list__title">{title}</p>
        {description !== undefined && (
          <p className="ds-coverage-list__description">{description}</p>
        )}
      </header>
      <ul className="ds-coverage-list__rows">
        {rows.map((row) => {
          const hue = dimensionHue(row.dimension);
          return (
            <li key={row.dimension} className="ds-coverage-list__row">
              <div className="ds-coverage-list__name">
                <p className="ds-coverage-list__dimension">
                  <span
                    aria-hidden="true"
                    className={`ds-coverage-list__key ds-coverage-list__key--${hue}`}
                  />
                  {row.name}
                </p>
                {row.detail !== undefined && (
                  <p className="ds-coverage-list__detail">{row.detail}</p>
                )}
              </div>
              <Meter label={`${row.name} coverage`} value={row.value} hue={hue} />
              <p className="ds-coverage-list__figure">
                <span className="ds-coverage-list__value">
                  {formatCoverage(row.value)}
                </span>
                {row.delta !== undefined && (
                  <Badge
                    tone={deltaTone(row.delta, 'up')}
                    className="ds-coverage-list__delta"
                  >
                    {formatPointsDelta(row.delta, window)}
                  </Badge>
                )}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
