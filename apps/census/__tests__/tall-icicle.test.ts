import { describe, expect, it } from 'vitest';

import { tallColumns } from '@/lib/tall-icicle.ts';

const file = (label: string, weight: number) => ({
  label,
  weight,
  detail: '100%',
  tone: 'success' as const,
});

/** Files of `lines` each out of 900, so that a line is a pixel of the figure. */
const tree = (...lines: number[]) => ({
  label: '@gate/ui',
  detail: '900 lines',
  children: [
    {
      label: 'atoms',
      detail: '900 lines',
      children: [...lines, 900 - lines.reduce((a, b) => a + b, 0)].map((n) =>
        file(`f${n}`, n),
      ),
    },
  ],
});

const cellOf = (lines: number, height?: number) =>
  tallColumns(tree(lines), height)[2]!.at(-1)!;

describe('tallColumns', () => {
  it('gives the tree one column per depth', () => {
    const columns = tallColumns(tree(300));

    expect(columns.map((column) => column.length)).toEqual([1, 1, 2]);
  });

  it('stacks the files by lines, heaviest at the top', () => {
    const [, , files] = tallColumns(tree(225));

    expect(files!.map(({ start, size }) => [start, size])).toEqual([
      ['0%', '75%'],
      ['75%', '25%'],
    ]);
  });

  it('keeps a file tone and draws a group neutral', () => {
    const [root, , files] = tallColumns(tree(300));

    expect([root![0]!.tone, files![0]!.tone]).toEqual(['neutral', 'success']);
  });

  it('names a group without its figure, however tall it is', () => {
    const [root, groups] = tallColumns(tree(300));

    expect([root![0], groups![0]].map((c) => [c!.label, c!.detail])).toEqual([
      ['@gate/ui', undefined],
      ['atoms', undefined],
    ]);
  });

  it('writes a file name and figure where both lines fit', () => {
    const cell = cellOf(50);

    expect([cell.label, cell.detail]).toEqual(['f50', '100%']);
  });

  it('drops the figure a pixel under two lines', () => {
    const cell = cellOf(49);

    expect([cell.label, cell.detail]).toEqual(['f49', undefined]);
  });

  it('leaves a file too short for one line unlabelled, at its own size', () => {
    const cell = cellOf(31);

    expect([cell.label, cell.detail, cell.size]).toEqual([
      undefined,
      undefined,
      '3.4444%',
    ]);
  });

  it('fits the lines to the height the figure stands at', () => {
    const cell = cellOf(50, 720);

    expect([cell.label, cell.detail]).toEqual(['f50', undefined]);
  });

  it('parts a cell from the next by the whole seam where the seam is half of it', () => {
    const cell = cellOf(4);

    expect(cell.seam).toBe(2);
  });

  it('keeps the seam within half of a cell shorter than that', () => {
    const cell = cellOf(1);

    expect(cell.seam).toBe(0.5);
  });

  it('names a file fallow has no figure for', () => {
    const [, files] = tallColumns({ label: 'r', children: [{ label: 'a', weight: 1 }] });

    expect(files).toEqual([
      { start: '0%', size: '100%', seam: 2, tone: 'neutral', label: 'a' },
    ]);
  });

  it('draws the root alone when no file has a line', () => {
    const columns = tallColumns({ label: 'r', children: [{ label: 'a', weight: 0 }] });

    expect(columns).toHaveLength(1);
  });
});
