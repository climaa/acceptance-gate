'use client';

import { useState } from 'react';

import { TrendChart, type TrendRange } from '@gate/ui';
import type { TrendSeries } from '@/lib/trend.ts';

/** Coverage over time, with the range the reader picks; 90 days to start, as the tile draws it. */
export function TrendCard({ series }: { series: TrendSeries[] }) {
  const [range, setRange] = useState<TrendRange>('90D');
  return (
    <TrendChart
      className="census-trend"
      title="Coverage over time"
      description="One point per measurement."
      series={series}
      range={range}
      onRangeChange={setRange}
    />
  );
}
