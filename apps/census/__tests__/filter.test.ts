import { describe, expect, it } from 'vitest';

import {
  NO_FILTER,
  filterChips,
  filterGaps,
  filterHref,
  gapRows,
  parseFilter,
} from '@/lib/filter.ts';
import { sample } from './sample';

const params = (query: string) => new URLSearchParams(query);

describe('parseFilter', () => {
  it('reads a dimension and a category', () => {
    expect(parseFilter(params('dimension=code&category=apps'))).toEqual({
      dimension: 'code',
      category: 'apps',
    });
  });

  it('ignores a value that names nothing', () => {
    expect(parseFilter(params('dimension=layers&category=all'))).toEqual(NO_FILTER);
  });

  it('is no filter without a query', () => {
    expect(parseFilter(params(''))).toEqual(NO_FILTER);
  });
});

describe('gapRows', () => {
  it('is every gap with its workspace category and anchor, in file order', () => {
    // Act
    const rows = gapRows(sample().measurement);

    // Assert
    expect(rows).toHaveLength(57);
    expect(rows[0]).toMatchObject({
      title: '@gate/links: measure coverage',
      workspace: '@gate/links',
      category: 'packages',
      anchor: 'gap-unmeasured-workspace:packages/links',
    });
    expect(rows[0]?.workspaceHref).toBe('/links');
  });
});

describe('filterGaps', () => {
  const { measurement } = sample();
  const rows = gapRows(measurement);

  it('keeps every gap with no filter', () => {
    expect(filterGaps(rows, NO_FILTER)).toHaveLength(measurement.gaps.length);
  });

  it('narrows to one dimension', () => {
    // Act
    const gaps = filterGaps(rows, { dimension: 'code', category: null });

    // Assert
    expect(gaps).toHaveLength(9);
    expect(new Set(gaps.map((g) => g.dimension))).toEqual(new Set(['code']));
  });

  it('narrows to the workspaces of one category', () => {
    const gaps = filterGaps(rows, { dimension: null, category: 'scripts' });

    expect(gaps.map((g) => g.workspace)).toEqual(['scripts/', '.sandcastle/']);
  });

  it('combines both', () => {
    const gaps = filterGaps(rows, { dimension: 'acceptance', category: 'packages' });

    expect(gaps).toEqual([]);
  });

  it('leaves Health empty: a Health value is never a gap', () => {
    expect(filterGaps(rows, { dimension: 'health', category: null })).toEqual([]);
  });
});

describe('filterHref', () => {
  it('sets one key and keeps the other', () => {
    const filter = { dimension: 'code', category: 'apps' } as const;

    expect(filterHref(filter, { dimension: 'visual' })).toBe(
      '/?dimension=visual&category=apps',
    );
  });

  it('clears a key, and is the bare home with nothing left', () => {
    expect(filterHref({ dimension: 'code', category: null }, { dimension: null })).toBe(
      '/',
    );
  });
});

describe('filterChips', () => {
  it('is one removable chip per key set, each removing only itself', () => {
    expect(filterChips({ dimension: 'code', category: 'apps' })).toEqual([
      { label: 'dimension: code', href: '/?category=apps' },
      { label: 'category: apps', href: '/?dimension=code' },
    ]);
  });

  it('is empty with no filter', () => {
    expect(filterChips(NO_FILTER)).toEqual([]);
  });
});
