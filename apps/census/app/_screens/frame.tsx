import type { ComponentType } from 'react';

import { CensusFrame } from '@/components/CensusFrame';
import { NO_FILTER, type HomeFilter } from '@/lib/filter.ts';
import type { HomeView } from '@/lib/home.ts';
// census's own sheet, which the root layout imports. The design system's arrives
// with Storybook's preview and again through this one; Vite loads a module once.
import '../globals.css';

/**
 * A screen's story, drawn as a reader sees the page: inside the frame the root
 * layout draws (`CensusShell` and the band under its top bar), at `pathname`,
 * edge to edge, with the filter its query names.
 */
export function inCensus(
  view: HomeView,
  pathname: string,
  filter: HomeFilter = NO_FILTER,
) {
  return {
    decorators: [
      (Story: ComponentType) => (
        <CensusFrame view={view} filter={filter}>
          <Story />
        </CensusFrame>
      ),
    ],
    parameters: {
      layout: 'fullscreen',
      nextjs: { appDirectory: true, navigation: { pathname } },
    },
  };
}
