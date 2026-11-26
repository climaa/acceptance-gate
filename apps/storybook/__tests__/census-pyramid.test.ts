import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TestPyramid, type PyramidBand } from '@gate/ui';
import { describe, expect, it } from 'vitest';
import { PyramidFigure } from '../.storybook/census-pyramid';

/**
 * Storybook swaps census's `@/app/_components/PyramidScene` for this file, so a
 * screen story draws the flat pyramid and never the WebGL scene: a capture must
 * not depend on the GPU of the machine that takes it. The swap only holds if the
 * stand-in answers the same export and draws exactly the figure the scene sits
 * on — the bands it was handed, nothing added, nothing dropped. Server-rendered:
 * the figure has no effects, so the markup is everything a capture sees.
 */

const BANDS: PyramidBand[] = [
  { dimension: 'code', label: 'Code · vitest cases', count: 3550 },
  { dimension: 'visual', label: 'Visual · screenshots', count: 286 },
  { dimension: 'acceptance', label: 'Acceptance · scenarios', count: 88 },
];

const figure = (bands: PyramidBand[]) =>
  renderToStaticMarkup(createElement(PyramidFigure, { bands }));

describe('the pyramid a census screen story draws', () => {
  it('is the flat figure for the same bands, with no scene laid over it', () => {
    const html = figure(BANDS);

    expect(html).toBe(renderToStaticMarkup(createElement(TestPyramid, { bands: BANDS })));
  });

  it('shows every band it was handed, top level first', () => {
    const html = figure(BANDS);

    const labels = [...html.matchAll(/ds-test-pyramid__label">([^<]*)</g)].map(
      (m) => m[1],
    );
    expect(labels).toEqual([
      'Acceptance · scenarios',
      'Visual · screenshots',
      'Code · vitest cases',
    ]);
  });

  it('draws one band per level', () => {
    const html = figure(BANDS);

    expect(html.match(/<polygon /g)).toHaveLength(BANDS.length);
  });

  it('draws an empty figure, not an error, when census has no bands yet', () => {
    const html = figure([]);

    expect({ bands: html.match(/<polygon /g), counts: html.match(/<li /g) }).toEqual({
      bands: null,
      counts: null,
    });
  });
});
