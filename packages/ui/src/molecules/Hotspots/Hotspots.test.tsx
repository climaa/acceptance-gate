import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Hotspots, hotspotDots, niceAxis, type Hotspot } from './Hotspots';

afterEach(cleanup);

describe('niceAxis', () => {
  it('rounds the largest value up to three round steps', () => {
    const axis = niceAxis(26);

    expect(axis).toEqual({ max: 30, ticks: [0, 10, 20, 30], decimals: 0 });
  });

  it('keeps decimal steps exact and reports the decimals they need', () => {
    const axis = niceAxis(0.23);

    expect(axis).toEqual({ max: 0.3, ticks: [0, 0.1, 0.2, 0.3], decimals: 1 });
  });

  it('does not add a step when the largest value lands on one', () => {
    const axis = niceAxis(0.2);

    expect(axis.max).toBe(0.2);
  });

  it('picks steps of 1, 2 or 5 times a power of ten', () => {
    const steps = [4, 13, 120].map((max) => niceAxis(max).ticks[1]);

    expect(steps).toEqual([2, 5, 50]);
  });

  it('falls back to a unit axis with nothing to plot', () => {
    const axes = [0, -3, Number.NaN].map((max) => niceAxis(max).max);

    expect(axes).toEqual([1, 1, 1]);
  });
});

describe('hotspotDots', () => {
  const at = (
    path: string,
    churn: number,
    complexity: number,
    weight?: number,
  ): Hotspot => ({
    path,
    churn,
    complexity,
    weight,
  });

  it('places each file by churn across and complexity up, as fractions of the plot', () => {
    const [dot] = hotspotDots([at('a.ts', 15, 0.15), at('b.ts', 30, 0.3)], {
      x: niceAxis(30),
      y: niceAxis(0.3),
    });

    expect(dot!.x).toBe(0.5);
    expect(dot!.y).toBeCloseTo(0.5, 10);
  });

  it('sizes the dots by weight between the smallest and the largest drawn', () => {
    const dots = hotspotDots(
      [at('a', 1, 0.1, 100), at('b', 1, 0.1, 200), at('c', 1, 0.1, 150)],
      {
        x: niceAxis(1),
        y: niceAxis(0.1),
      },
    );

    expect(dots.map(({ diameter }) => diameter)).toEqual([16, 28, 22]);
  });

  it('draws every dot at the middle size when the weights do not differ or are missing', () => {
    const dots = hotspotDots([at('a', 1, 0.1, 5), at('b', 1, 0.1, 5), at('c', 1, 0.1)], {
      x: niceAxis(1),
      y: niceAxis(0.1),
    });

    expect(dots.map(({ diameter }) => diameter)).toEqual([22, 22, 22]);
  });

  it('leaves out a file whose churn or complexity is negative or not a number', () => {
    const dots = hotspotDots(
      [at('ok', 1, 0.1), at('neg', -1, 0.1), at('nan', 1, Number.NaN)],
      { x: niceAxis(1), y: niceAxis(0.1) },
    );

    expect(dots.map(({ hotspot }) => hotspot.path)).toEqual(['ok']);
  });
});

describe('Hotspots', () => {
  const LABELS = { xLabel: 'commits', yLabel: 'density', quadrantLabel: 'refactor' };
  const FILES: Hotspot[] = [
    { path: 'policy.mjs', churn: 19, complexity: 0.1 },
    { path: 'comparison.ts', churn: 13, complexity: 0.16, hot: true, label: 'end' },
  ];

  it('lists every file with its churn and complexity for a reader', () => {
    render(<Hotspots {...LABELS} hotspots={FILES} label="Hotspots" />);

    const list = screen.getByRole('list', { name: 'Hotspots' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'policy.mjs: 19 commits, complexity density 0.1',
      'comparison.ts: 13 commits, complexity density 0.16, refactor target',
    ]);
  });

  it('labels on the plot only the files given a label side', () => {
    const { container } = render(<Hotspots {...LABELS} hotspots={FILES} />);

    const labels = [...container.querySelectorAll('.ds-hotspots__label')].map(
      (label) => label.textContent,
    );
    expect(labels).toEqual(['comparison.ts']);
  });
});
