import type { ReactNode } from 'react';

import { Badge } from '../../atoms/Badge/Badge';

export type SparkDirection = 'up' | 'down';

export interface SparkStatProps {
  label: string;
  value: ReactNode;
  /** The change over the window, in the value's own unit. */
  delta: number;
  /** Which way is an improvement. Decides the delta's tone. Defaults to `up`. */
  better?: SparkDirection;
  /** The window the delta spans, as read after it: `in 30 days`. */
  window?: string;
  /** Oldest first. The last value is the current one and gets the dot. */
  series: number[];
  className?: string;
}

export interface SparkBox {
  width: number;
  height: number;
  /** Room above the highest value. */
  top: number;
  /** Room below the lowest value. */
  bottom: number;
}

/**
 * The sparkline's drawing box, in the SVG's own user units (1 unit = 1 CSS px),
 * as the board draws it. The line runs edge to edge; the end dot overhangs the
 * right edge into the panel's padding, which is why the SVG does not clip.
 */
const BOX: SparkBox = { width: 198, height: 52, top: 8.4, bottom: 12.8 };
const DOT_RADIUS = 4;

/**
 * A series scaled into a box: x spread evenly first to last, y with the largest
 * value at the top. A flat series sits on the middle line, and a single value at
 * the right edge, where the current point is always drawn. Non-finite values
 * have no place on the line and are dropped.
 */
export function sparklinePoints(series: number[], box: SparkBox): [number, number][] {
  const values = series.filter(Number.isFinite);
  if (values.length === 0) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = box.height - box.top - box.bottom;
  const last = values.length - 1;

  return values.map((v, i) => {
    const x = last === 0 ? box.width : (box.width * i) / last;
    const y =
      max === min ? box.top + span / 2 : box.top + (span * (max - v)) / (max - min);
    return [x, y];
  });
}

export function formatDelta(delta: number): string {
  if (delta < 0) return `\u2212${-delta}`;
  return delta > 0 ? `+${delta}` : '0';
}

export function deltaTone(delta: number, better: SparkDirection) {
  if (delta === 0) return 'neutral';
  return delta > 0 === (better === 'up') ? 'success' : 'danger';
}

/** One value with its small time series: a small multiple in a row of them. */
export function SparkStat({
  label,
  value,
  delta,
  better = 'up',
  window,
  series,
  className,
}: SparkStatProps) {
  const points = sparklinePoints(series, BOX);
  const end = points.at(-1);

  return (
    <div className={['ds-spark-stat', className].filter(Boolean).join(' ')}>
      <span className="ds-spark-stat__label">{label}</span>
      <p className="ds-spark-stat__value">{value}</p>
      <p className="ds-spark-stat__change">
        <Badge tone={deltaTone(delta, better)} className="ds-spark-stat__delta">
          {formatDelta(delta)}
        </Badge>
        {window && <span>{window}</span>}
      </p>
      <svg
        className="ds-spark-stat__line"
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        width={BOX.width}
        height={BOX.height}
        aria-hidden="true"
      >
        {points.length > 1 && (
          <polyline points={points.map(([x, y]) => `${x},${y}`).join(' ')} />
        )}
        {end && <circle cx={end[0]} cy={end[1]} r={DOT_RADIUS} />}
      </svg>
    </div>
  );
}
