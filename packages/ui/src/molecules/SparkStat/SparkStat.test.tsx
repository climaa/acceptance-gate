import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SparkStat, deltaTone, formatDelta, sparklinePoints } from './SparkStat';

afterEach(cleanup);

const BOX = { width: 100, height: 24, top: 2, bottom: 6 };

describe('sparklinePoints', () => {
  it('spreads the series across the width, first to last', () => {
    const points = sparklinePoints([10, 5, 0], BOX);

    expect(points.map(([x]) => x)).toEqual([0, 50, 100]);
  });

  it('puts the largest value at the top and the smallest at the bottom', () => {
    const points = sparklinePoints([10, 5, 0], BOX);

    expect(points.map(([, y]) => y)).toEqual([2, 10, 18]);
  });

  it('keeps the margins the box asks for above and below the line', () => {
    const points = sparklinePoints([1, 0], {
      width: 10,
      height: 52,
      top: 8.4,
      bottom: 12.8,
    });

    expect(points.map(([, y]) => y)).toEqual([8.4, 39.2]);
  });

  it('draws a flat series along the middle rather than dividing by zero', () => {
    const points = sparklinePoints([7, 7, 7], BOX);

    expect(points.map(([, y]) => y)).toEqual([10, 10, 10]);
  });

  it('places a single value at the end, where the current point is drawn', () => {
    const points = sparklinePoints([4], BOX);

    expect(points).toEqual([[100, 10]]);
  });

  it('returns no points for an empty series', () => {
    const points = sparklinePoints([], BOX);

    expect(points).toEqual([]);
  });

  it('skips values that are not finite instead of drawing them off the box', () => {
    const points = sparklinePoints([10, Number.NaN, 0], BOX);

    expect(points).toEqual([
      [0, 2],
      [100, 18],
    ]);
  });
});

describe('formatDelta', () => {
  it.each([
    // A true minus, U+2212: a hyphen is shorter and sits lower than the plus.
    [-3, '\u22123'],
    [4, '+4'],
    [0, '0'],
  ])('writes %d as %s', (delta, text) => {
    expect(formatDelta(delta)).toBe(text);
  });
});

describe('deltaTone', () => {
  it('reads a fall as good when lower is better', () => {
    expect(deltaTone(-3, 'down')).toBe('success');
  });

  it('reads a rise as bad when lower is better', () => {
    expect(deltaTone(3, 'down')).toBe('danger');
  });

  it('reads a rise as good when higher is better', () => {
    expect(deltaTone(3, 'up')).toBe('success');
  });

  it('reads no change as neutral', () => {
    expect(deltaTone(0, 'up')).toBe('neutral');
  });
});

describe('SparkStat', () => {
  it('renders the label, the value, the change and its window', () => {
    render(
      <SparkStat
        label="CRAP ≥ 30"
        value="7"
        delta={-3}
        better="down"
        window="in 30 days"
        series={[10, 9, 7]}
      />,
    );

    expect(screen.getByText('CRAP ≥ 30')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('\u22123').className).toContain('ds-badge--success');
    expect(screen.getByText('in 30 days')).toBeTruthy();
  });

  it('leaves out the change and its window when no change is known', () => {
    const { container } = render(
      <SparkStat label="Files" value="3" window="in 30 days" series={[]} />,
    );

    expect(container.querySelector('.ds-badge')).toBeNull();
    expect(screen.queryByText('in 30 days')).toBeNull();
  });

  it('hides the sparkline from assistive tech: the figures carry the meaning', () => {
    const { container } = render(
      <SparkStat label="Files" value="3" delta={0} series={[3, 3]} />,
    );

    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('draws no line for an empty series', () => {
    const { container } = render(
      <SparkStat label="Files" value="3" delta={0} series={[]} />,
    );

    expect(container.querySelector('polyline')).toBeNull();
    expect(container.querySelector('circle')).toBeNull();
  });
});
