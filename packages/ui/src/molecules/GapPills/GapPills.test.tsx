import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { GapPills, gapAxis, gapPillLayout, sortByCount } from './GapPills';

afterEach(cleanup);

const GAPS = [
  { dimension: 'code', label: 'code', count: 9 },
  { dimension: 'acceptance', label: 'accept.', count: 2 },
  { dimension: 'visual', label: 'visual', count: 12 },
  { dimension: 'health', label: 'health', count: 0 },
] as const;

describe('sortByCount', () => {
  it('puts the dimension with the most gaps first', () => {
    const sorted = sortByCount([...GAPS]);

    expect(sorted.map((gap) => gap.count)).toEqual([12, 9, 2, 0]);
  });

  it('keeps the given order between equal counts', () => {
    const sorted = sortByCount([
      { dimension: 'code', label: 'code', count: 3 },
      { dimension: 'visual', label: 'visual', count: 3 },
    ]);

    expect(sorted.map((gap) => gap.label)).toEqual(['code', 'visual']);
  });

  it('leaves its input as it was', () => {
    const input = [...GAPS];

    sortByCount(input);

    expect(input.map((gap) => gap.count)).toEqual([9, 2, 12, 0]);
  });
});

describe('gapAxis', () => {
  it('splits the axis into three equal steps up to the largest count', () => {
    expect(gapAxis([12, 9, 2, 0])).toEqual([0, 4, 8, 12]);
  });

  it('rounds the step up to a whole gap so the top tick clears the tallest pill', () => {
    expect(gapAxis([10])).toEqual([0, 4, 8, 12]);
  });

  it('keeps a step of one when there are no gaps at all', () => {
    expect(gapAxis([0, 0])).toEqual([0, 1, 2, 3]);
  });
});

describe('gapPillLayout', () => {
  const layout = gapPillLayout([12, 9, 2, 0]);

  it('centres one column per count across the plot', () => {
    expect(layout.pills.map((pill) => pill.x)).toEqual([57.5, 116.5, 175.5, 234.5]);
  });

  it('grows each pill up from the baseline in proportion to its count', () => {
    expect(layout.pills.map((pill) => pill.height)).toEqual([160, 120, 160 / 6, 10]);
    expect(layout.pills.map((pill) => pill.y + pill.height)).toEqual([
      176, 176, 176, 176,
    ]);
  });

  it('draws a zero as a dot, never as nothing', () => {
    expect(layout.pills[3]).toMatchObject({ height: 10, y: 166 });
  });

  it('places the gridlines from the baseline up to the top of the plot', () => {
    expect(layout.ticks).toEqual([
      { value: 0, y: 176 },
      { value: 4, y: 176 - 160 / 3 },
      { value: 8, y: 176 - 320 / 3 },
      { value: 12, y: 16 },
    ]);
  });
});

describe('GapPills', () => {
  it('names every count for assistive tech, the largest first', () => {
    render(<GapPills gaps={[...GAPS]} />);

    expect(
      screen.getByRole('img', {
        name: 'Gaps per dimension: visual 12, code 9, accept. 2, health 0',
      }),
    ).toBeTruthy();
  });

  it('draws each pill in its dimension hue, in descending order', () => {
    const { container } = render(<GapPills gaps={[...GAPS]} />);

    const hues = [...container.querySelectorAll('.ds-gap-pills__pill')].map((pill) =>
      [...pill.classList].find((c) => c.startsWith('ds-gap-pills__pill--')),
    );
    expect(hues).toEqual([
      'ds-gap-pills__pill--chart-2',
      'ds-gap-pills__pill--chart',
      'ds-gap-pills__pill--chart-3',
      'ds-gap-pills__pill--chart-4',
    ]);
  });
});
