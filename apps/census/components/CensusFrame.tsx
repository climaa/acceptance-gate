import type { ReactNode } from 'react';

import { NO_FILTER, type HomeFilter } from '@/lib/filter.ts';
import type { HomeView } from '@/lib/home.ts';
import { CensusShell } from './CensusShell';
import { MeasurementBar } from './MeasurementBar';

export interface CensusFrameProps {
  view: HomeView;
  filter?: HomeFilter;
  children: ReactNode;
}

/** What the root layout draws around every page: the shell and the band under its top bar. */
export function CensusFrame({ view, filter = NO_FILTER, children }: CensusFrameProps) {
  return (
    <CensusShell view={view} filter={filter}>
      <MeasurementBar view={view} filter={filter} />
      {children}
    </CensusShell>
  );
}
