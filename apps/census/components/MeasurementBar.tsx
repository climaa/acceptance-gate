'use client';

import { useRouter } from 'next/navigation';

import { Badge, SegmentedControl } from '@gate/ui';
import { filterHref, type HomeFilter } from '@/lib/filter.ts';
import type { HomeView } from '@/lib/home.ts';
import type { Category, Dimension } from '@/lib/measurement.ts';

export interface MeasurementBarProps {
  view: HomeView;
  filter: HomeFilter;
}

/**
 * The band under the top bar while a measurement is committed: the dimension
 * and category filters, then what was measured — its state, its commit linked
 * to the repository, and its date. With nothing measured the band stays, empty,
 * as the tile draws it: there is nothing to filter and nothing to date.
 */
export function MeasurementBar({ view, filter }: MeasurementBarProps) {
  const router = useRouter();
  if (view.state === 'empty') return <div className="census-bar" />;
  const { filters, meta } = view;
  const go = (key: 'dimension' | 'category') => (value: string) =>
    router.push(
      filterHref(filter, {
        [key]: value === 'all' ? null : (value as Dimension & Category),
      }),
    );

  return (
    <div className="census-bar">
      <SegmentedControl
        label="Dimension"
        options={filters.dimensions}
        value={filter.dimension ?? 'all'}
        onChange={go('dimension')}
      />
      <SegmentedControl
        label="Category"
        options={filters.categories}
        value={filter.category ?? 'all'}
        onChange={go('category')}
      />
      <p className="census-bar__meta">
        {meta.staleDays === null ? (
          <Badge>measured</Badge>
        ) : (
          <Badge tone="warning">stale · {meta.staleDays} days</Badge>
        )}
        <span>
          commit{' '}
          <a className="census-bar__commit" href={meta.commit.href}>
            {meta.commit.short}
          </a>
        </span>
        <span>{meta.date}</span>
      </p>
    </div>
  );
}
