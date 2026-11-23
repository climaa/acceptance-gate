/**
 * Coverage over time: the history's lines, and how far each one moved. A delta
 * compares the latest point with the newest point at least {@link WINDOW_DAYS}
 * older, so it reads "in 30 days" whatever the measuring cadence was; a history
 * too short for that has no delta rather than a shorter one.
 */
import {
  DIMENSIONS,
  type Dimension,
  type History,
  type HistoryPoint,
} from './measurement.ts';

export const WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

export const DIMENSION_LABEL: Record<Dimension, string> = {
  code: 'Code',
  visual: 'Visual',
  acceptance: 'Acceptance',
  health: 'Health',
};

export interface TrendPoint {
  /** `YYYY-MM-DD`, UTC. */
  at: string;
  value: number;
}

export interface TrendSeries {
  dimension: Dimension;
  name: string;
  points: TrendPoint[];
  delta?: number;
}

const oneDecimal = (n: number) => Math.round(n * 10) / 10;

/** The newest point measured at least 30 days before the latest one. */
export function baselinePoint(points: readonly HistoryPoint[]): HistoryPoint | undefined {
  const latest = points.at(-1);
  if (latest === undefined) return undefined;
  const cutoff = Date.parse(latest.measuredAt) - WINDOW_DAYS * DAY_MS;
  return [...points].reverse().find((p) => Date.parse(p.measuredAt) <= cutoff);
}

/** The latest value less the baseline's; `undefined` when either has none. */
export function deltaOf(
  points: readonly HistoryPoint[],
  pick: (point: HistoryPoint) => number | null,
): number | undefined {
  const latest = points.at(-1);
  const base = baselinePoint(points);
  if (latest === undefined || base === undefined) return undefined;
  const [now, then] = [pick(latest), pick(base)];
  return now === null || then === null ? undefined : oneDecimal(now - then);
}

/** One line per dimension the history has a value for, in dimension order. */
export function trendSeries(history: History): TrendSeries[] {
  return DIMENSIONS.flatMap((dimension) => {
    const points = history.points.flatMap((p) => {
      const value = p.dimensions[dimension];
      // TrendChart reads a day, `YYYY-MM-DD`, in UTC.
      return value === null ? [] : [{ at: p.measuredAt.slice(0, 10), value }];
    });
    if (points.length === 0) return [];
    const delta = deltaOf(history.points, (p) => p.dimensions[dimension]);
    return [
      {
        dimension,
        name: DIMENSION_LABEL[dimension],
        points,
        ...(delta === undefined ? {} : { delta }),
      },
    ];
  });
}
