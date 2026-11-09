import type { ComponentType } from 'react';
import { BlogFrame } from '@/components/BlogFrame';
// The blog's own sheet, which the root layout imports. The design system's
// arrives with Storybook's preview and again through this one; Vite loads a
// module once, so it is not applied twice.
import '../globals.css';

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
        <BlogFrame>
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
