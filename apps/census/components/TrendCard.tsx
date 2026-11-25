'use client';

import { useState } from 'react';

import { TrendChart, type TrendRange } from '@gate/ui';
import type { HomeFilter } from '@/lib/filter.ts';
import type { TrendSeries } from '@/lib/trend.ts';

/**
 * Coverage over time, with the range the reader picks; 90 days to start, as
 * the tile draws it. A dimension filter dims the other dimensions' series, as
 * the coverage rows.
 */
export function TrendCard({
  series,
  filter,
}: {
  series: TrendSeries[];
  filter: HomeFilter;
}) {
  const [range, setRange] = useState<TrendRange>('90D');
  return (
    <TrendChart
      className={
        filter.dimension
          ? `census-trend census-trend--lit-${filter.dimension}`
          : 'census-trend'
      }
      title="Coverage over time"
      description="One point per measurement."
      series={series}
      range={range}
      onRangeChange={setRange}
    />
  );
}
