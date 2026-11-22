import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StatePies, pieSlices, slicePath } from './StatePies';

afterEach(cleanup);

describe('pieSlices', () => {
  it('turns clockwise from the top: own, then inherited, then none', () => {
    const slices = pieSlices({ own: 3, inherited: 1, none: 13 });

    expect(slices.map(({ source }) => source)).toEqual(['own', 'inherited', 'none']);
    expect(slices[0]!.start).toBe(0);
    expect(slices[0]!.end).toBeCloseTo(3 / 17, 10);
    expect(slices[1]!.end).toBeCloseTo(4 / 17, 10);
    expect(slices[2]!.end).toBe(1);
  });

  it('leaves out a source with no routes', () => {
    const slices = pieSlices({ own: 0, inherited: 17, none: 0 });

    expect(slices).toEqual([{ source: 'inherited', start: 0, end: 1 }]);
  });

  it('counts a negative or non-finite count as none', () => {
    const slices = pieSlices({ own: -1, inherited: Number.NaN, none: 2 });

    expect(slices).toEqual([{ source: 'none', start: 0, end: 1 }]);
  });

  it('has no slice when there are no routes', () => {
    const slices = pieSlices({ own: 0, inherited: 0, none: 0 });

    expect(slices).toEqual([]);
  });
});

describe('slicePath', () => {
  it('draws a quarter from the top to the right as an arc from the centre', () => {
    const path = slicePath({ source: 'own', start: 0, end: 0.25 });

    expect(path).toBe('M 50 50 L 50 0 A 50 50 0 0 1 100 50 Z');
  });

  it('takes the long way round for a slice over half the pie', () => {
    const path = slicePath({ source: 'none', start: 0.25, end: 1 });

    expect(path).toBe('M 50 50 L 100 50 A 50 50 0 1 1 50 0 Z');
  });

  it('draws a whole pie as a circle, which one arc cannot close', () => {
    const path = slicePath({ source: 'inherited', start: 0, end: 1 });

    expect(path).toBe('M 50 0 A 50 50 0 1 1 50 100 A 50 50 0 1 1 50 0 Z');
  });
});

describe('StatePies', () => {
  const STATES = [
    { name: 'loading', own: 3, inherited: 1, none: 13 },
    { name: 'error', own: 0, inherited: 17, none: 0 },
  ];

  it('names each state over its counts', () => {
    render(<StatePies states={STATES} />);

    const items = screen
      .getAllByRole('listitem')
      .filter((item) => item.querySelector('p'));
    expect(items.map((item) => item.textContent)).toEqual([
      'loading3 own1 inherited13 none',
      'error0 own17 inherited0 none',
    ]);
  });

  it('marks routes left with no boundary only when there are some', () => {
    render(<StatePies states={STATES} />);

    const marked = [...document.querySelectorAll('.ds-state-pies__count--missing')].map(
      (count) => count.textContent,
    );
    expect(marked).toEqual(['13 none']);
  });
});
