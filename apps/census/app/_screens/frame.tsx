import type { ComponentType } from 'react';

import { CensusShell } from '@/components/CensusShell';
import { MeasurementBar } from '@/components/MeasurementBar';
import type { HomeView } from '@/lib/home.ts';
// census's own sheet, which the root layout imports. The design system's arrives
// with Storybook's preview and again through this one; Vite loads a module once.
import '../globals.css';

/**
 * A screen's story, drawn as a reader sees the page: inside the frame the root
 * layout draws (`CensusShell` and the band under its top bar), at `pathname`,
 * edge to edge.
 */
export function inCensus(view: HomeView, pathname: string) {
  return {
    decorators: [
      (Story: ComponentType) => (
        <CensusShell dimensions={view.dimensions} githubHref={view.githubHref}>
          <MeasurementBar view={view} />
          <Story />
        </CensusShell>
      ),
    ],
    parameters: {
      layout: 'fullscreen',
      nextjs: { appDirectory: true, navigation: { pathname } },
    },
  };
}
