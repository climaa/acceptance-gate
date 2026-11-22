import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PenaltyBars, formatPenalty, listFree, penaltyBars } from './PenaltyBars';

afterEach(cleanup);

describe('penaltyBars', () => {
  it('scales each bar against the largest penalty, which fills the track', () => {
    const bars = penaltyBars([
      { name: 'Coupling', points: 1.8 },
      { name: 'Function size', points: 10 },
    ]);

    expect(bars.map(({ name, size }) => [name, size])).toEqual([
      ['Function size', 1],
      ['Coupling', 0.18],
    ]);
  });

  it('orders the bars from the costliest down', () => {
    const bars = penaltyBars([
      { name: 'Dead exports', points: 0.9 },
      { name: 'Maintainability', points: 1.4 },
      { name: 'Dead files', points: 1.2 },
    ]);

    expect(bars.map(({ name }) => name)).toEqual([
      'Maintainability',
      'Dead files',
      'Dead exports',
    ]);
  });

  it('leaves out a penalty that costs nothing, a negative one and one that is not a number', () => {
    const bars = penaltyBars([
      { name: 'Cycles', points: 0 },
      { name: 'Odd', points: -2 },
      { name: 'Broken', points: Number.NaN },
      { name: 'Coupling', points: 2 },
    ]);

    expect(bars.map(({ name }) => name)).toEqual(['Coupling']);
  });

  it('draws no bar when nothing costs points', () => {
    const bars = penaltyBars([{ name: 'Cycles', points: 0 }]);

    expect(bars).toEqual([]);
  });
});

describe('formatPenalty', () => {
  it('signs the points with a minus and keeps at most one decimal', () => {
    const labels = [10, 1.8, 0.94].map(formatPenalty);

    expect(labels).toEqual(['−10', '−1.8', '−0.9']);
  });
});

describe('listFree', () => {
  it('names the penalties that cost nothing in prose, lower-cased', () => {
    const note = listFree([
      { name: 'Complexity', points: 0 },
      { name: 'Coupling', points: 1 },
      { name: 'Duplication', points: 0 },
      { name: 'Unused dependencies', points: 0 },
    ]);

    expect(note).toBe('0 for complexity, duplication and unused dependencies');
  });

  it('needs no conjunction for a single name', () => {
    const note = listFree([{ name: 'Cycles', points: 0 }]);

    expect(note).toBe('0 for cycles');
  });

  it('has nothing to say when every penalty costs points', () => {
    const note = listFree([{ name: 'Coupling', points: 1 }]);

    expect(note).toBeUndefined();
  });
});

describe('PenaltyBars', () => {
  const PENALTIES = [
    { name: 'Coupling', points: 1.8 },
    { name: 'Function size', points: 10 },
    { name: 'Cycles', points: 0 },
  ];

  it('lists each penalty with its cost under the title', () => {
    render(<PenaltyBars title="What costs points" penalties={PENALTIES} />);

    const list = screen.getByRole('list', { name: 'What costs points' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Function size−10', 'Coupling−1.8']);
  });

  it('closes with the penalties that cost nothing', () => {
    render(<PenaltyBars title="What costs points" penalties={PENALTIES} />);

    expect(screen.getByText('0 for cycles')).toBeTruthy();
  });

  it('sizes each bar as a share of the track', () => {
    const { container } = render(
      <PenaltyBars title="What costs points" penalties={PENALTIES} />,
    );

    const widths = [
      ...container.querySelectorAll<HTMLElement>('.ds-penalty-bars__bar'),
    ].map((bar) => bar.style.inlineSize);
    expect(widths).toEqual(['100%', '18%']);
  });
});
