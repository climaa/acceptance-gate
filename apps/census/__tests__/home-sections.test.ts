import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { GapPillsCard, NotesCard, PyramidCard } from '@/components/HomeSections';
import type { HomeFilter } from '@/lib/filter.ts';
import { NO_FILTER } from '@/lib/filter.ts';

const CODE: HomeFilter = { dimension: 'code', category: null };

const PYRAMID = {
  bands: [
    { dimension: 'code', label: 'Code · vitest cases', count: 3550 },
    { dimension: 'visual', label: 'Visual · screenshots', count: 286 },
    { dimension: 'acceptance', label: 'Acceptance · scenarios', count: 88 },
  ],
} as const;

const GAP_PILLS = {
  caption: '23 gaps, each one an issue to file.',
  gaps: [
    { dimension: 'visual', label: 'visual', count: 12 },
    { dimension: 'code', label: 'code', count: 9 },
  ],
} as const;

const pyramid = (filter: HomeFilter) =>
  renderToStaticMarkup(
    createElement(PyramidCard, {
      data: { bands: [...PYRAMID.bands] },
      filter,
    }),
  );

const gapPills = (filter: HomeFilter) =>
  renderToStaticMarkup(
    createElement(GapPillsCard, {
      data: { caption: GAP_PILLS.caption, gaps: [...GAP_PILLS.gaps] },
      filter,
    }),
  );

describe('the home cards a dimension filter dims', () => {
  it('lights the filtered dimension on the testing pyramid', () => {
    // Arrange
    const filter = CODE;

    // Act
    const html = pyramid(filter);

    // Assert
    expect(html).toContain('data-lit="code"');
  });

  it('lights the filtered dimension on the gap pills', () => {
    // Arrange
    const filter = CODE;

    // Act
    const html = gapPills(filter);

    // Assert
    expect(html).toContain('data-lit="code"');
  });

  it('lights nothing on either card when no dimension is filtered', () => {
    // Arrange
    const filter = NO_FILTER;

    // Act
    const html = pyramid(filter) + gapPills(filter);

    // Assert
    expect(html).not.toContain('data-lit');
  });
});

describe('the notes card', () => {
  it('marks its rerun block for the phone wrap and keeps the text as given', () => {
    // Arrange
    const rerun = 'workflow: pnpm measure\ntools: vitest 3 · playwright 1';

    // Act
    const html = renderToStaticMarkup(
      createElement(NotesCard, {
        notes: [],
        rerun,
        exports: { jsonHref: '/measurement.json', markdown: '' },
      }),
    );

    // Assert
    expect(html).toContain(
      `<div class="ds-code census-rerun"><pre class="ds-code__pre" tabindex="0"><code>${rerun}</code></pre></div>`,
    );
  });
});
