'use client';

import type { ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';

import { parseFilter } from '@/lib/filter.ts';
import type { HomeView } from '@/lib/home.ts';
import { CensusFrame } from './CensusFrame';
import { HomeScreen } from './HomeScreen';

/*
 * The reader's query, read in the browser. `/` is prerendered once, unfiltered,
 * and every filtered address is that same page: each of these sits under a
 * Suspense boundary whose fallback is the unfiltered render, so the static HTML
 * is the bare home and the query applies on hydration.
 */

export function FilteredFrame({
  view,
  children,
}: {
  view: HomeView;
  children: ReactNode;
}) {
  const filter = parseFilter(useSearchParams());
  return (
    <CensusFrame view={view} filter={filter}>
      {children}
    </CensusFrame>
  );
}

export function FilteredHome({ view }: { view: HomeView }) {
  return <HomeScreen view={view} filter={parseFilter(useSearchParams())} />;
}
