import type { ComponentType } from 'react';
import { BlogFrame } from '@/components/BlogFrame';
// The blog's own sheet, which the root layout imports. The design system's
// arrives with Storybook's preview and again through this one; Vite loads a
// module once, so it is not applied twice.
import '../globals.css';

/** The version a screen is photographed with. Fixed, so a release does not move
 *  every screen's footer by a few pixels the gate's allowance then hides. */
const SCREEN_VERSION = '1.8.0';

/**
 * A screen's story, drawn as a visitor sees the page: inside the frame the root
 * layout draws (`BlogFrame`), at `pathname`, edge to edge.
 *
 * `routes` are the route patterns the story stands for, as their directories
 * under `app/` spell them: the screens coverage check (`apps/storybook/
 * __tests__/screen-routes.test.ts`) holds every page of the app to one.
 */
export function inBlog(pathname: string) {
  return {
    decorators: [
      (Story: ComponentType) => (
        <BlogFrame version={SCREEN_VERSION}>
          <Story />
        </BlogFrame>
      ),
    ],
    parameters: {
      layout: 'fullscreen',
      nextjs: { appDirectory: true, navigation: { pathname } },
    },
  };
}
