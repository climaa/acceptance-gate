import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  TestPyramid,
  bandRatio,
  bandWidths,
  formatCount,
  pyramidBands,
  type PyramidBand,
  type PyramidShape,
} from './TestPyramid';

afterEach(cleanup);

const BANDS: PyramidBand[] = [
  { dimension: 'code', label: 'Code · vitest cases', count: 3550 },
  { dimension: 'visual', label: 'Visual · screenshots', count: 286 },
  { dimension: 'acceptance', label: 'Acceptance · scenarios', count: 88 },
];

const BOX = { width: 340, bandHeight: 86, gap: 6 };

describe('bandWidths', () => {
  it('gives the largest count the full width', () => {
    const widths = bandWidths([3550, 286, 88], 340);

    expect(widths[0]).toBe(340);
  });

  it('makes every other width proportional to the log of its count', () => {
    const widths = bandWidths([3550, 286, 88], 340);

    expect(widths[1]).toBeCloseTo(235.2, 1);
    expect(widths[2]).toBeCloseTo(186.2, 1);
  });

  it('scales to the largest count wherever it sits, so an inverted pyramid shows', () => {
    const widths = bandWidths([10, 100], 200);

    expect(widths).toEqual([100, 200]);
  });

  it('draws a count of one or none as no width at all', () => {
    const widths = bandWidths([100, 1, 0], 200);

    expect(widths).toEqual([200, 0, 0]);
  });

  it('draws nothing rather than dividing by zero when no count exceeds one', () => {
    const widths = bandWidths([1, 0], 200);

    expect(widths).toEqual([0, 0]);
  });

  it('treats a count that is not finite as none', () => {
    const widths = bandWidths([100, Number.NaN], 200);

    expect(widths).toEqual([200, 0]);
  });
});

describe('pyramidBands', () => {
  it('stacks the bands base first, from the bottom up, with the gap between them', () => {
    const bands = pyramidBands([3550, 286, 88], BOX);

    expect(bands.map((band) => band.top)).toEqual([184, 92, 0]);
  });

  it('narrows each band to the width of the band above it', () => {
    const [code, visual] = pyramidBands([3550, 286, 88], BOX) as [
      PyramidShape,
      PyramidShape,
    ];

    expect(code.points[0]![0]).toBeCloseTo(52.4, 1);
    expect(code.points[1]![0]).toBeCloseTo(287.6, 1);
    expect(visual.points[0]![0]).toBeCloseTo(76.9, 1);
  });

  it('closes the top band to a point at the centre', () => {
    const top = pyramidBands([3550, 286, 88], BOX).at(-1)!;

    expect(top.points[0]).toEqual([170, 0]);
    expect(top.points[1]).toEqual([170, 0]);
  });

  it('runs the base band the full width along its bottom edge', () => {
    const [code] = pyramidBands([3550, 286, 88], BOX) as [PyramidShape];

    expect(code.points[2]).toEqual([340, 270]);
    expect(code.points[3]).toEqual([0, 270]);
  });

  it('returns no bands for no counts', () => {
    const bands = pyramidBands([], BOX);

    expect(bands).toEqual([]);
  });
});

describe('bandRatio', () => {
  it('reads how many times the lower band outnumbers the upper one, rounded', () => {
    const ratio = bandRatio(3550, 88);

    expect(ratio).toBe('40×');
  });

  it('keeps a ratio under ten to one decimal, where rounding would hide it', () => {
    const ratio = bandRatio(286, 88);

    expect(ratio).toBe('3.3×');
  });

  it('has no ratio over an empty band', () => {
    const ratio = bandRatio(286, 0);

    expect(ratio).toBeUndefined();
  });
});

describe('formatCount', () => {
  it('groups thousands with a comma', () => {
    const text = formatCount(3550);

    expect(text).toBe('3,550');
  });
});

describe('TestPyramid', () => {
  it('lists the counts from the top of the pyramid down', () => {
    render(<TestPyramid bands={BANDS} />);

    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      '88Acceptance · scenarios',
      '286Visual · screenshots',
      '3,550Code · vitest cases',
    ]);
  });

  it('draws one band per level in its dimension hue', () => {
    const { container } = render(<TestPyramid bands={BANDS} />);

    const hues = [...container.querySelectorAll('polygon')].map((p) =>
      p.getAttribute('class'),
    );
    expect(hues).toEqual([
      'ds-test-pyramid__band ds-test-pyramid__band--chart-3',
      'ds-test-pyramid__band ds-test-pyramid__band--chart-2',
      'ds-test-pyramid__band ds-test-pyramid__band--chart',
    ]);
  });
});
