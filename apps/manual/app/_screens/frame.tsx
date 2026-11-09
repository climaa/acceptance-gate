import type { ComponentType } from 'react';
import { ManualFrame } from '@/components/ManualFrame';
// The manual's own sheet, which the root layout imports. The design system's
// arrives with Storybook's preview and again through this one; Vite loads a
// module once, so it is not applied twice.
import '../globals.css';

/**
 * A screen's story, drawn as a visitor sees the page: inside the frame the root
 * layout draws (`ManualFrame`), at `pathname`, edge to edge.
 */
export function inManual(pathname: string) {
  return {
    decorators: [
      (Story: ComponentType) => (
        <ManualFrame>
          <Story />
        </ManualFrame>
      ),
    ],
    parameters: {
      layout: 'fullscreen',
      nextjs: { appDirectory: true, navigation: { pathname } },
    },
  };
}
