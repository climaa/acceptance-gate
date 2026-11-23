import { describe, expect, it } from 'vitest';

import type { HistoryPoint } from '@/lib/measurement.ts';
import { baselinePoint, deltaOf, trendSeries } from '@/lib/trend.ts';
import { sample } from './sample';

const point = (measuredAt: string, code: number | null, score = 80): HistoryPoint => ({
  commit: 'a'.repeat(40),
  measuredAt: `${measuredAt}T12:00:00.000Z`,
  dimensions: { code, visual: 50, acceptance: null, health: 80 },
  fallow: { score, grade: 'B', dupPct: 2, crapOver: 3, overCeiling: 1 },
});

describe('baselinePoint', () => {
  it('is the newest point at least 30 days older than the latest', () => {
    // Arrange
    const points = [
      point('2026-09-01', 10),
      point('2026-10-21', 20),
      point('2026-10-22', 25),
      point('2026-11-20', 30),
    ];

    // Act
    const base = baselinePoint(points);

    // Assert
    expect(base?.measuredAt).toBe('2026-10-21T12:00:00.000Z');
  });

  it('is undefined when no point is 30 days old', () => {
    expect(
      baselinePoint([point('2026-11-01', 10), point('2026-11-20', 30)]),
    ).toBeUndefined();
  });

  it('is undefined for an empty history', () => {
    expect(baselinePoint([])).toBeUndefined();
  });
});

describe('deltaOf', () => {
  const points = [point('2026-10-01', 12.3, 80.1), point('2026-11-20', 31, 84.7)];

  it('is the latest value less the baseline, to one decimal', () => {
    expect(deltaOf(points, (p) => p.dimensions.code)).toBe(18.7);
    expect(deltaOf(points, (p) => p.fallow.score)).toBe(4.6);
  });

  it('is undefined when either end has no value', () => {
    expect(deltaOf(points, (p) => p.dimensions.acceptance)).toBeUndefined();
    expect(
      deltaOf(
        [point('2026-10-01', null), point('2026-11-20', 3)],
        (p) => p.dimensions.code,
      ),
    ).toBeUndefined();
  });

  it('is undefined with no baseline', () => {
    expect(deltaOf([point('2026-11-20', 31)], (p) => p.dimensions.code)).toBeUndefined();
  });
});

describe('trendSeries', () => {
  it('draws one series per dimension with a value, nulls left out', () => {
    // Arrange
    const history = {
      schema: 1 as const,
      points: [point('2026-10-01', null), point('2026-11-20', 31)],
    };

    // Act
    const series = trendSeries(history);

    // Assert
    expect(series.map((s) => [s.dimension, s.points.length])).toEqual([
      ['code', 1],
      ['visual', 2],
      ['health', 2],
    ]);
    expect(series[0]?.delta).toBeUndefined();
    expect(series[1]?.delta).toBe(0);
  });

  it('names the series and dates its points from the sample', () => {
    const series = trendSeries(sample().history);

    expect(series.map((s) => [s.name, s.delta])).toEqual([
      ['Code', 7],
      ['Visual', 7],
      ['Acceptance', 25],
      ['Health', 9.1],
    ]);
    expect(series[0]?.points.at(-1)).toEqual({
      at: '2026-11-20',
      value: 31,
    });
  });
});
