import type { ComponentType } from 'react';
import { ManualFrame } from '@/components/ManualFrame';
// The manual's own sheet, which the root layout imports. The design system's
// arrives with Storybook's preview and again through this one; Vite loads a
// module once, so it is not applied twice.
import '../globals.css';

/** The version a screen is photographed with. Fixed, so a release does not move
 *  every screen's footer by a few pixels the gate's allowance then hides. */
const SCREEN_VERSION = '1.8.0';

/**
 * A screen's story, drawn as a visitor sees the page: inside the frame the root
 * layout draws (`ManualFrame`), at `pathname`, edge to edge.
 */
export function inManual(pathname: string) {
  return {
    decorators: [
      (Story: ComponentType) => (
        <ManualFrame version={SCREEN_VERSION}>
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
