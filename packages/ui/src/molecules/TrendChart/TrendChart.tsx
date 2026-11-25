'use client';

import type { CSSProperties, ReactNode } from 'react';

import { Badge } from '../../atoms/Badge/Badge';
import { SegmentedControl } from '../../atoms/SegmentedControl/SegmentedControl';
import {
  dimensionHue,
  formatCoverage,
  formatPointsDelta,
  type CoverageDimension,
} from '../CoverageList/CoverageList';
import { deltaTone } from '../SparkStat/SparkStat';

export type TrendRange = '30D' | '90D' | 'All';

export interface TrendPoint {
  /** The measurement's date, `YYYY-MM-DD`, read as UTC. */
  at: string;
  /** 0–100: the dimension's coverage at that measurement. */
  value: number;
}

export interface TrendSeries {
  dimension: CoverageDimension;
  name: string;
  /** Oldest first, one point per measurement. */
  points: TrendPoint[];
  /** The change the legend reports, in percentage points. */
  delta?: number;
}

export interface TrendChartProps {
  title: string;
  description?: ReactNode;
  series: TrendSeries[];
  range: TrendRange;
  onRangeChange: (range: TrendRange) => void;
  className?: string;
}

export interface TrendLine {
  series: TrendSeries;
  /** Each point as [x, y] fractions of the plot, from its top-left corner. */
  points: [number, number][];
  /** The latest measured value, whatever the range shows. */
  latest?: number;
}

export interface MonthTick {
  /** A fraction of the plot's width. */
  at: number;
  label: string;
}

type Domain = [number, number];

const DAY = 86_400_000;
const RANGE_DAYS: Record<TrendRange, number | undefined> = {
  '30D': 30,
  '90D': 90,
  All: undefined,
};
const RANGES = (['30D', '90D', 'All'] as const).map((value) => ({ value, label: value }));

/**
 * The least distance between two end labels' centres, as a fraction of the
 * plot's height: a 12px label and 2px of air on the 204px plot the board draws.
 */
const LABEL_GAP = 14 / 204;

interface Measured {
  t: number;
  value: number;
}

function measured(series: TrendSeries): Measured[] {
  return series.points
    .map((point) => ({ t: Date.parse(`${point.at}T00:00:00Z`), value: point.value }))
    .filter(({ t, value }) => Number.isFinite(t) && Number.isFinite(value));
}

/**
 * The span of time the plot draws: from the range's number of days before the
 * latest measurement of any series up to it, or from the first measurement for
 * All. None when nothing has been measured.
 */
export function trendDomain(
  series: TrendSeries[],
  range: TrendRange,
): Domain | undefined {
  const times = series.flatMap((s) => measured(s).map(({ t }) => t));
  if (times.length === 0) return undefined;

  const end = Math.max(...times);
  const days = RANGE_DAYS[range];
  return [days === undefined ? Math.min(...times) : end - days * DAY, end];
}

/** A moment as a fraction of the domain, oldest at 0. An empty span sits at 1. */
export function xScale(t: number, [start, end]: Domain): number {
  return end === start ? 1 : (t - start) / (end - start);
}

/** A coverage value as a fraction of the plot's height from the top. */
export function yScale(value: number): number {
  return (100 - Math.min(100, Math.max(0, value))) / 100;
}

/** Each series' points inside the range, scaled into the plot. */
export function trendLines(series: TrendSeries[], range: TrendRange): TrendLine[] {
  const domain = trendDomain(series, range);

  return series.map((s) => {
    const all = measured(s);
    const inside = domain ? all.filter(({ t }) => t >= domain[0]) : [];
    return {
      series: s,
      points: inside.map(({ t, value }) => [xScale(t, domain!), yScale(value)]),
      latest: all.at(-1)?.value,
    };
  });
}

function monthStarts([start, end]: Domain): Date[] {
  const first = new Date(start);
  const cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
  const months: Date[] = [];
  for (; cursor.getTime() <= end; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    months.push(new Date(cursor));
  }
  return months;
}

/**
 * The first of each month inside the domain, as the time axis labels it. The
 * first label and any that crosses into a new year carry the year. A long
 * domain keeps every few months, so no more than `maxTicks` labels share the
 * axis.
 */
export function monthTicks(domain: Domain, maxTicks = 6): MonthTick[] {
  const months = monthStarts(domain);
  const step = Math.max(1, Math.ceil(months.length / maxTicks));
  let previousYear: number | undefined;

  return months
    .filter((_, i) => i % step === 0)
    .map((month) => {
      const year = month.getUTCFullYear();
      const name = month.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
      const label = year === previousYear ? name : `${name} ${year}`;
      previousYear = year;
      return { at: xScale(month.getTime(), domain), label };
    });
}

/**
 * End labels moved apart until no two are closer than `gap`, keeping their
 * order down the plot and staying within 0–1: pushed down first, then back up
 * from the bottom edge. Answers in the order the labels were given.
 */
export function placeEndLabels(ys: number[], gap: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);

  const down: number[] = [];
  for (const { y } of order) {
    const above = down.at(-1);
    down.push(above === undefined ? y : Math.max(y, above + gap));
  }
  const up: number[] = [];
  for (const y of down.reverse()) {
    const below = up.at(-1);
    up.push(Math.max(0, Math.min(y, below === undefined ? 1 : below - gap)));
  }
  up.reverse();

  const placed = new Map(order.map(({ i }, k) => [i, up[k]]));
  return ys.map((y, i) => placed.get(i) ?? y);
}

const GRID = [100, 75, 50, 25, 0];
const percent = (fraction: number) => `${fraction * 100}%`;
const at = (x: number | undefined, y: number | undefined): CSSProperties => ({
  ...(x === undefined ? {} : { insetInlineStart: percent(x) }),
  ...(y === undefined ? {} : { insetBlockStart: percent(y) }),
});

/** Census's coverage over time: one line per dimension, latest value at its end. */
export function TrendChart({
  title,
  description,
  series,
  range,
  onRangeChange,
  className,
}: TrendChartProps) {
  const lines = trendLines(series, range);
  const domain = trendDomain(series, range);
  const ticks = domain ? monthTicks(domain) : [];
  const ends = lines.filter((line) => line.points.length > 0);
  const labelYs = placeEndLabels(
    ends.map((line) => line.points.at(-1)![1]),
    LABEL_GAP,
  );

  return (
    <section className={['ds-trend-chart', className].filter(Boolean).join(' ')}>
      <header className="ds-trend-chart__head">
        <div className="ds-trend-chart__heading">
          <p className="ds-trend-chart__title">{title}</p>
          {description !== undefined && (
            <p className="ds-trend-chart__description">{description}</p>
          )}
        </div>
        <SegmentedControl
          className="ds-trend-chart__range"
          label="Range"
          options={RANGES}
          value={range}
          onChange={(value) => onRangeChange(value as TrendRange)}
        />
      </header>
      <ul className="ds-trend-chart__legend">
        {lines.map(({ series: s, latest }) => (
          <li
            key={s.dimension}
            className="ds-trend-chart__legend-item"
            data-dimension={s.dimension}
          >
            <span
              aria-hidden="true"
              className={`ds-trend-chart__swatch ds-trend-chart__hue--${dimensionHue(s.dimension)}`}
            />
            <span>{s.name}</span>
            {latest !== undefined && (
              <span className="ds-trend-chart__latest">{formatCoverage(latest)}</span>
            )}
            {s.delta !== undefined && (
              <Badge tone={deltaTone(s.delta, 'up')} className="ds-trend-chart__delta">
                {formatPointsDelta(s.delta)}
              </Badge>
            )}
          </li>
        ))}
      </ul>
      <div className="ds-trend-chart__plot">
        <div className="ds-trend-chart__y-axis" aria-hidden="true">
          {GRID.map((value) => (
            <span
              key={value}
              className="ds-trend-chart__y-label"
              style={at(undefined, yScale(value))}
            >
              {value}%
            </span>
          ))}
        </div>
        <div className="ds-trend-chart__data">
          {GRID.map((value) => (
            <span
              key={value}
              aria-hidden="true"
              className="ds-trend-chart__grid"
              style={at(undefined, yScale(value))}
            />
          ))}
          <svg
            className="ds-trend-chart__lines"
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {lines.map(({ series: s, points }) =>
              points.length > 1 ? (
                <polyline
                  key={s.dimension}
                  className={`ds-trend-chart__line ds-trend-chart__hue--${dimensionHue(s.dimension)}`}
                  data-dimension={s.dimension}
                  vectorEffect="non-scaling-stroke"
                  points={points.map(([x, y]) => `${x * 1000},${y * 1000}`).join(' ')}
                />
              ) : null,
            )}
          </svg>
          {ends.map(({ series: s, points }) => {
            const [x, y] = points.at(-1)!;
            return (
              <span
                key={s.dimension}
                aria-hidden="true"
                className={`ds-trend-chart__dot ds-trend-chart__hue--${dimensionHue(s.dimension)}`}
                data-dimension={s.dimension}
                style={at(x, y)}
              />
            );
          })}
        </div>
        <ul className="ds-trend-chart__ends">
          {ends.map(({ series: s, latest }, i) => (
            <li
              key={s.dimension}
              className="ds-trend-chart__end"
              data-dimension={s.dimension}
              style={at(undefined, labelYs[i])}
            >
              {`${s.name} ${formatCoverage(latest!)}`}
            </li>
          ))}
        </ul>
        <div className="ds-trend-chart__x-axis" aria-hidden="true">
          {ticks.map((tick) => (
            <span
              key={tick.label}
              className="ds-trend-chart__x-label"
              style={at(tick.at, undefined)}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
