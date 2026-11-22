import { describe, expect, it } from 'vitest';

import { groupResults, matches, type SearchEntry } from './search';

const entry = (over: Partial<SearchEntry> & Pick<SearchEntry, 'id'>): SearchEntry => ({
  kind: 'file',
  title: over.id,
  ...over,
});

const INDEX: SearchEntry[] = [
  entry({ id: 'f1', kind: 'file', title: 'packages/ui/src/organisms/Table/Table.tsx' }),
  entry({ id: 'g1', kind: 'gap', title: 'Table', meta: 'component-incomplete' }),
  entry({ id: 'c1', kind: 'component', title: 'Table', meta: 'organisms · @gate/ui' }),
  entry({ id: 'w1', kind: 'workspace', title: 'packages/ui' }),
  entry({ id: 'f2', kind: 'file', title: 'packages/ui/src/organisms/Table/Table.css' }),
  entry({ id: 's1', kind: 'scenario', title: 'A reader sorts the table' }),
];

const ids = (groups: ReturnType<typeof groupResults>) =>
  groups.map((group) => [group.kind, group.entries.map((e) => e.id)]);

describe('matches', () => {
  it('matches a term case-insensitively anywhere in the title', () => {
    const file = INDEX[0]!;

    const result = matches(file, 'TABLE.TSX');

    expect(result).toBe(true);
  });

  it('matches a term found only in the meta line', () => {
    const gap = INDEX[1]!;

    const result = matches(gap, 'incomplete');

    expect(result).toBe(true);
  });

  it('requires every whitespace-separated term, in any order', () => {
    const file = INDEX[0]!;

    const result = [matches(file, 'tsx organisms'), matches(file, 'tsx molecules')];

    expect(result).toEqual([true, false]);
  });

  it('matches nothing for a blank query', () => {
    const file = INDEX[0]!;

    const result = matches(file, '   ');

    expect(result).toBe(false);
  });
});

describe('groupResults', () => {
  it('groups matches by kind in the order the palette draws them', () => {
    const query = 'table';

    const groups = groupResults(INDEX, query);

    expect(ids(groups)).toEqual([
      ['component', ['c1']],
      ['file', ['f1', 'f2']],
      ['gap', ['g1']],
      ['scenario', ['s1']],
    ]);
  });

  it('keeps every kind that matched, workspaces first', () => {
    const query = 'packages/ui';

    const groups = groupResults(INDEX, query);

    expect(groups.map((group) => group.kind)).toEqual(['workspace', 'file']);
  });

  it('keeps the index order inside a group', () => {
    const reversed = [...INDEX].reverse();

    const groups = groupResults(reversed, 'table.');

    expect(ids(groups)).toEqual([['file', ['f2', 'f1']]]);
  });

  it('drops a kind with no match rather than drawing an empty heading', () => {
    const query = 'sorts';

    const groups = groupResults(INDEX, query);

    expect(ids(groups)).toEqual([['scenario', ['s1']]]);
  });

  it('returns no groups for a blank query or an empty index', () => {
    const result = [groupResults(INDEX, ''), groupResults([], 'table')];

    expect(result).toEqual([[], []]);
  });
});
