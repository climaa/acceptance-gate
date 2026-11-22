import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StoriesList, listMissing, storiesTotals, storyShare } from './StoriesList';

afterEach(cleanup);

const WORKSPACES = [
  { name: '@gate/ui', total: 31, missing: ['Stack'] },
  {
    name: '@gate/visual-diff-ui',
    total: 44,
    missing: Array.from({ length: 39 }, (_, i) => `Component${i + 1}`),
  },
];

describe('storiesTotals', () => {
  it('adds up the components and the ones missing a story across workspaces', () => {
    expect(storiesTotals(WORKSPACES)).toEqual({ missing: 40, total: 75 });
  });

  it('is zero over zero for no workspaces', () => {
    expect(storiesTotals([])).toEqual({ missing: 0, total: 0 });
  });
});

describe('storyShare', () => {
  it('is the percentage of components that have a story', () => {
    expect(storyShare({ name: 'blog', total: 4, missing: ['A'] })).toBe(75);
  });

  it('counts a workspace with no components as missing nothing', () => {
    expect(storyShare({ name: 'empty', total: 0, missing: [] })).toBe(100);
  });
});

describe('listMissing', () => {
  it('names up to five components and counts the rest', () => {
    expect(listMissing(['A', 'B', 'C', 'D', 'E', 'F', 'G'])).toBe('A, B, C, D, E +2');
  });

  it('names all five when there are exactly five', () => {
    expect(listMissing(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C, D, E');
  });

  it('is empty when nothing is missing', () => {
    expect(listMissing([])).toBe('');
  });
});

describe('StoriesList', () => {
  it('heads the list with the count missing out of every component', () => {
    render(<StoriesList workspaces={WORKSPACES} />);

    expect(screen.getByText('40')).toBeTruthy();
    expect(screen.getByText('of 75 components have no story')).toBeTruthy();
  });

  it('gives each workspace its count, its share as a Meter and the names missing', () => {
    render(<StoriesList workspaces={WORKSPACES} />);

    expect(screen.getByText('30 of 31 with a story')).toBeTruthy();
    expect(screen.getByText('1 missing')).toBeTruthy();
    expect(screen.getByText('Stack')).toBeTruthy();
    expect(screen.getByText('39 missing')).toBeTruthy();
    expect(
      screen.getByText('Component1, Component2, Component3, Component4, Component5 +34'),
    ).toBeTruthy();
    const meter = screen.getByRole('meter', {
      name: '@gate/ui: components with a story',
    });
    expect(Number(meter.getAttribute('aria-valuenow'))).toBeCloseTo((30 / 31) * 100);
  });

  it('keeps the workspaces in the order given', () => {
    render(<StoriesList workspaces={[...WORKSPACES].reverse()} />);

    const names = screen
      .getAllByRole('listitem')
      .map((row) => row.firstElementChild?.textContent);
    expect(names[0]).toContain('@gate/visual-diff-ui');
  });
});
