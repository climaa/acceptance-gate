import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  TrendChart,
  monthTicks,
  placeEndLabels,
  trendDomain,
  trendLines,
  xScale,
  yScale,
  type TrendLine,
  type TrendSeries,
} from './TrendChart';

afterEach(cleanup);

const DAY = 86_400_000;
const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

const SERIES: TrendSeries[] = [
  {
    dimension: 'code',
    name: 'Code',
    delta: 7,
    points: [
      { at: '2026-06-01', value: 5 },
      { at: '2026-10-01', value: 20 },
      { at: '2026-11-21', value: 31 },
    ],
  },
  {
    dimension: 'health',
    name: 'Health',
    delta: -2,
    points: [
      { at: '2026-11-01', value: 93 },
      { at: '2026-11-11', value: 91 },
    ],
  },
];

describe('trendDomain', () => {
  it('ends at the latest measurement of any series', () => {
    const domain = trendDomain(SERIES, '30D');

    expect(domain?.[1]).toBe(at('2026-11-21'));
  });

  it('reaches back the range’s number of days from the end', () => {
    const domain = trendDomain(SERIES, '90D');

    expect(domain?.[0]).toBe(at('2026-11-21') - 90 * DAY);
  });

  it('reaches back to the first measurement for All', () => {
    const domain = trendDomain(SERIES, 'All');

    expect(domain?.[0]).toBe(at('2026-06-01'));
  });

  it('has no domain without a measurement', () => {
    const domain = trendDomain([{ dimension: 'code', name: 'Code', points: [] }], 'All');

    expect(domain).toBeUndefined();
  });
});

describe('xScale', () => {
  it('maps the domain onto 0 to 1, oldest at the left', () => {
    const x = xScale(at('2026-11-11'), [at('2026-11-01'), at('2026-11-21')]);

    expect(x).toBe(0.5);
  });

  it('puts a single moment at the right edge, where the latest point is drawn', () => {
    const x = xScale(at('2026-11-21'), [at('2026-11-21'), at('2026-11-21')]);

    expect(x).toBe(1);
  });
});

describe('yScale', () => {
  it('puts 100% at the top and 0% at the bottom', () => {
    const ys = [100, 75, 0].map(yScale);

    expect(ys).toEqual([0, 0.25, 1]);
  });

  it('clamps a value outside 0–100 to the plot', () => {
    const ys = [130, -5].map(yScale);

    expect(ys).toEqual([0, 1]);
  });
});

describe('trendLines', () => {
  it('keeps only the measurements inside the range', () => {
    const [code] = trendLines(SERIES, '30D') as [TrendLine];

    expect(code.points).toHaveLength(1);
  });

  it('keeps every measurement for All, scaled into the plot', () => {
    const [code] = trendLines(SERIES, 'All') as [TrendLine];

    expect(code.points[0]).toEqual([0, 0.95]);
    expect(code.points.at(-1)).toEqual([1, 0.69]);
  });

  it('takes the latest value as the current one even when the range hides history', () => {
    const [, health] = trendLines(SERIES, '30D') as [TrendLine, TrendLine];

    expect(health.latest).toBe(91);
  });

  it('skips a measurement whose date or value cannot be read', () => {
    const [line] = trendLines(
      [
        {
          dimension: 'code',
          name: 'Code',
          points: [
            { at: 'not a date', value: 10 },
            { at: '2026-11-20', value: Number.NaN },
            { at: '2026-11-21', value: 12 },
          ],
        },
      ],
      'All',
    ) as [TrendLine];

    expect(line.points).toEqual([[1, 0.88]]);
  });
});

describe('monthTicks', () => {
  it('marks the first of each month inside the domain', () => {
    const ticks = monthTicks([at('2026-08-23'), at('2026-11-21')]);

    expect(ticks.map((t) => t.label)).toEqual(['Sep 2026', 'Oct', 'Nov']);
  });

  it('places each tick by its date', () => {
    const ticks = monthTicks([at('2026-09-01') - 10 * DAY, at('2026-09-01') + 10 * DAY]);

    expect(ticks).toEqual([{ at: 0.5, label: 'Sep 2026' }]);
  });

  it('names the year again when it turns', () => {
    const ticks = monthTicks([at('2026-11-15'), at('2027-02-15')]);

    expect(ticks.map((t) => t.label)).toEqual(['Dec 2026', 'Jan 2027', 'Feb']);
  });

  it('thins a long domain to every few months so the labels never collide', () => {
    const ticks = monthTicks([at('2025-01-15'), at('2026-12-15')], 6);

    expect(ticks.length).toBeLessThanOrEqual(6);
    expect(ticks[0]?.label).toBe('Feb 2025');
  });

  it('has no ticks over an empty domain', () => {
    const ticks = monthTicks([at('2026-11-21'), at('2026-11-21')]);

    expect(ticks).toEqual([]);
  });
});

describe('placeEndLabels', () => {
  it('leaves labels that are already apart on their points', () => {
    const ys = placeEndLabels([0.1, 0.5, 0.9], 0.1);

    expect(ys).toEqual([0.1, 0.5, 0.9]);
  });

  it('pushes a crowding label down by the minimum gap, keeping the order', () => {
    const ys = placeEndLabels([0.5, 0.52], 0.1);

    expect(ys[0]).toBe(0.5);
    expect(ys[1]).toBeCloseTo(0.6);
  });

  it('pushes labels up instead when the bottom has no room', () => {
    const ys = placeEndLabels([0.98, 1], 0.1);

    expect(ys[0]).toBeCloseTo(0.9);
    expect(ys[1]).toBe(1);
  });

  it('answers in the order the labels were given, whatever their heights', () => {
    const ys = placeEndLabels([0.9, 0.1], 0.1);

    expect(ys).toEqual([0.9, 0.1]);
  });
});

describe('TrendChart', () => {
  it('reports the range chosen in its control', () => {
    const onRangeChange = vi.fn();
    render(
      <TrendChart
        title="Coverage over time"
        series={SERIES}
        range="90D"
        onRangeChange={onRangeChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '30D' }));

    expect(onRangeChange).toHaveBeenCalledWith('30D');
  });

  it('labels each line’s end with its name and latest value', () => {
    render(
      <TrendChart
        title="Coverage over time"
        series={SERIES}
        range="All"
        onRangeChange={() => {}}
      />,
    );

    expect(screen.getByText('Code 31%')).toBeTruthy();
    expect(screen.getByText('Health 91%')).toBeTruthy();
  });

  it('names each series’ key, line, dot and end label by its dimension', () => {
    // Arrange
    const { container } = render(
      <TrendChart
        title="Coverage over time"
        series={SERIES}
        range="All"
        onRangeChange={() => {}}
      />,
    );

    // Act
    const named = (dimension: string) =>
      [...container.querySelectorAll(`[data-dimension="${dimension}"]`)].map(
        (el) => el.getAttribute('class')?.split(' ')[0],
      );

    // Assert
    const marks = [
      'ds-trend-chart__legend-item',
      'ds-trend-chart__line',
      'ds-trend-chart__dot',
      'ds-trend-chart__end',
    ];
    expect(named('code')).toEqual(marks);
    expect(named('health')).toEqual(marks);
  });
});
