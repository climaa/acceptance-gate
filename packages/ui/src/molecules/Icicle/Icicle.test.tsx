import { act, cleanup, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fitLabel,
  icicleRows,
  nodeWeight,
  type IcicleCell,
  type IcicleNode,
} from './geometry';
import { Icicle } from './Icicle';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Lays every element out `width` px wide: jsdom has no layout of its own. */
const layOut = (width: number) =>
  vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(0, 0, width, 172));

const drawnLabels = (container: Element) =>
  [...container.querySelectorAll('.ds-icicle__label')].map((el) => el.textContent);

const leaf = (label: string, weight: number, extra: Partial<IcicleNode> = {}) => ({
  label,
  weight,
  ...extra,
});

const TREE: IcicleNode = {
  label: 'repository',
  detail: '40 lines',
  children: [
    { label: 'scripts', children: [leaf('scripts/', 10)] },
    { label: 'apps', children: [leaf('@gate/blog', 10), leaf('@gate/console', 20)] },
  ],
};

const spans = (row: IcicleCell[]) => row.map((cell) => [cell.start, cell.size]);

describe('nodeWeight', () => {
  it('weighs a leaf by its own weight', () => {
    const weight = nodeWeight(leaf('a', 12));

    expect(weight).toBe(12);
  });

  it('weighs a parent by the sum of its children, ignoring a weight of its own', () => {
    const weight = nodeWeight({
      label: 'p',
      weight: 99,
      children: [leaf('a', 2), leaf('b', 3)],
    });

    expect(weight).toBe(5);
  });

  it('counts a negative, missing or non-finite weight as none', () => {
    const weight = nodeWeight({
      label: 'p',
      children: [leaf('a', -4), { label: 'b' }, leaf('c', Number.NaN), leaf('d', 1)],
    });

    expect(weight).toBe(1);
  });
});

describe('icicleRows', () => {
  it('gives the tree one row per depth, the root alone on the first', () => {
    const rows = icicleRows(TREE);

    expect(rows.map((row) => row.map((cell) => cell.node.label))).toEqual([
      ['repository'],
      ['apps', 'scripts'],
      ['@gate/console', '@gate/blog', 'scripts/'],
    ]);
  });

  it('spans the root across the whole width', () => {
    const [root] = icicleRows(TREE);

    expect(spans(root!)).toEqual([[0, 1]]);
  });

  it('splits each parent among its children by weight, heaviest first', () => {
    const [, groups, leaves] = icicleRows(TREE);

    expect(spans(groups!)).toEqual([
      [0, 0.75],
      [0.75, 0.25],
    ]);
    expect(spans(leaves!)).toEqual([
      [0, 0.5],
      [0.5, 0.25],
      [0.75, 0.25],
    ]);
  });

  it('keeps the given order between children of equal weight', () => {
    const rows = icicleRows({
      label: 'r',
      children: [leaf('first', 1), leaf('second', 1)],
    });

    expect(rows[1]!.map((cell) => cell.node.label)).toEqual(['first', 'second']);
  });

  it('records each cell at its depth', () => {
    const rows = icicleRows(TREE);

    expect(rows.map((row) => row.map((cell) => cell.depth))).toEqual([
      [0],
      [1, 1],
      [2, 2, 2],
    ]);
  });

  it('leaves out a child with no weight rather than drawing it at zero width', () => {
    const rows = icicleRows({
      label: 'r',
      children: [leaf('kept', 3), leaf('empty', 0)],
    });

    expect(rows[1]!.map((cell) => cell.node.label)).toEqual(['kept']);
  });

  it('draws only the root when nothing in the tree has weight', () => {
    const rows = icicleRows({ label: 'r', children: [leaf('a', 0)] });

    expect(rows).toHaveLength(1);
    expect(spans(rows[0]!)).toEqual([[0, 1]]);
  });

  it('stops at a branch with no children while a sibling goes deeper', () => {
    const rows = icicleRows({
      label: 'r',
      children: [leaf('flat', 1), { label: 'deep', children: [leaf('x', 1)] }],
    });

    expect(rows[2]!.map((cell) => [cell.node.label, cell.start, cell.size])).toEqual([
      ['x', 0.5, 0.5],
    ]);
  });
});

describe('fitLabel', () => {
  it('keeps a label that fits its cell whole', () => {
    const label = fitLabel('@gate/ui', 100);

    expect(label).toBe('@gate/ui');
  });

  it('cuts a label that overflows and ends it with an ellipsis', () => {
    const label = fitLabel('@gate/visual-diff', 18 + 12 * 7.2);

    expect(label).toBe('@gate/visua…');
  });

  it('fits a label exactly as wide as the room left inside the cell', () => {
    const label = fitLabel('abcde', 18 + 5 * 7.2);

    expect(label).toBe('abcde');
  });

  it('keeps three characters and the ellipsis at the narrowest cell that is labelled', () => {
    const label = fitLabel('Thumbnail', 18 + 4 * 7.2);

    expect(label).toBe('Thu…');
  });

  it('labels nothing in a cell too narrow for three characters and the ellipsis', () => {
    const label = fitLabel('Thumbnail', 18 + 4 * 7.2 - 1);

    expect(label).toBeUndefined();
  });

  it('labels nothing below the minimum, even a name short enough to fit', () => {
    const label = fitLabel('ui', 18 + 3 * 7.2);

    expect(label).toBeUndefined();
  });

  it('labels nothing in a cell of no width or a width that is not finite', () => {
    expect(fitLabel('a', 0)).toBeUndefined();
    expect(fitLabel('a', Number.NaN)).toBeUndefined();
  });
});

describe('Icicle', () => {
  it('draws one cell per weighted node, row by row', () => {
    const { container } = render(<Icicle root={TREE} />);

    const rows = container.querySelectorAll('.ds-icicle__row');
    expect([...rows].map((row) => row.children.length)).toEqual([1, 2, 3]);
  });

  it('places each cell by its share of the width', () => {
    const { container } = render(<Icicle root={TREE} />);

    const scripts = container.querySelectorAll<HTMLElement>('.ds-icicle__row')[1]!
      .children[1] as HTMLElement;
    expect(scripts.style.insetInlineStart).toBe('75%');
    expect(scripts.style.inlineSize).toBe('25%');
  });

  it('colours a cell by its tone and falls back to neutral', () => {
    const { container } = render(
      <Icicle root={{ label: 'r', children: [leaf('hot', 1, { tone: 'heat-4' })] }} />,
    );

    const [root, hot] = container.querySelectorAll('.ds-icicle__cell');
    expect(root!.className).toContain('ds-icicle__cell--neutral');
    expect(hot!.className).toContain('ds-icicle__cell--heat-4');
  });

  it('fits each label to the width the figure is laid out at', () => {
    const { container } = render(<Icicle root={TREE} width={200} />);

    const labels = [...container.querySelectorAll('.ds-icicle__label')].map(
      (el) => el.textContent,
    );
    expect(labels).toEqual(['repository', 'apps', 'scr…', '@gate/cons…', '@ga…', 'scr…']);
  });

  it('fits each label to the rendered width once it is narrower than expected', () => {
    layOut(318);

    const { container } = render(<Icicle root={TREE} />);

    expect(drawnLabels(container)).toEqual([
      'repository',
      'apps',
      'scripts',
      '@gate/console',
      '@gate/b…',
      'scripts/',
    ]);
  });

  it('leaves a cell with no room at the rendered width unlabelled', () => {
    layOut(120);

    const { container } = render(<Icicle root={TREE} />);

    expect(drawnLabels(container)).toEqual(['repository', 'apps', '@gat…']);
  });

  it('fits the labels again when the figure is resized', () => {
    let resize = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    layOut(1248);
    const { container } = render(<Icicle root={TREE} />);

    layOut(120);
    act(() => resize());

    expect(drawnLabels(container)).toEqual(['repository', 'apps', '@gat…']);
  });

  it('keeps its width while it is not displayed', () => {
    layOut(0);

    const { container } = render(<Icicle root={TREE} />);

    expect(drawnLabels(container)).toContain('@gate/console');
  });

  it('hydrates a narrow figure from the markup the server sent', () => {
    const mismatch = vi.spyOn(console, 'error').mockImplementation(() => {});
    const container = document.createElement('div');
    container.innerHTML = renderToString(<Icicle root={TREE} />);
    layOut(120);

    render(<Icicle root={TREE} />, { container, hydrate: true });

    expect(mismatch).not.toHaveBeenCalled();
    expect(drawnLabels(container)).toEqual(['repository', 'apps', '@gat…']);
  });

  it('gives a reader every node whole, nested as the tree is, whatever the cells show', () => {
    render(<Icicle root={TREE} width={160} label="Coverage by workspace" />);

    const tree = screen.getByRole('list', { name: 'Coverage by workspace' });
    expect(within(tree).getByText('@gate/blog')).toBeTruthy();
    expect(within(tree).getByText('repository · 40 lines')).toBeTruthy();
  });

  it('hides the drawn rows from assistive technology', () => {
    const { container } = render(<Icicle root={TREE} />);

    expect(container.querySelector('.ds-icicle__rows')!.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });
});
