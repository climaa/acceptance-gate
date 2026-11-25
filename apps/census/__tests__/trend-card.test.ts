import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { TrendCard } from '@/components/TrendCard';
import type { HomeFilter } from '@/lib/filter.ts';
import { NO_FILTER } from '@/lib/filter.ts';

const SERIES = [
  {
    dimension: 'code' as const,
    name: 'Code',
    points: [
      { at: '2026-11-01', value: 20 },
      { at: '2026-11-21', value: 31 },
    ],
  },
];

const trendCard = (filter: HomeFilter) =>
  renderToStaticMarkup(createElement(TrendCard, { series: SERIES, filter }));

describe('the trend card a dimension filter dims', () => {
  it('lights the filtered dimension on the chart', () => {
    // Arrange
    const filter: HomeFilter = { dimension: 'code', category: null };

    // Act
    const html = trendCard(filter);

    // Assert
    expect(html).toContain('class="ds-trend-chart census-trend census-trend--lit-code"');
  });

  it('lights nothing when no dimension is filtered', () => {
    // Arrange
    const filter = NO_FILTER;

    // Act
    const html = trendCard(filter);

    // Assert
    expect(html).not.toContain('census-trend--lit');
  });
});
