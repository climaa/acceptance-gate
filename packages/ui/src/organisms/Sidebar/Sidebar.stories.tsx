import type { Meta, StoryObj } from '@storybook/react';

import { Sidebar } from './Sidebar';

/**
 * `visual-diff:fullpage`: the sidebar runs the viewport's height, which is what
 * its tiles draw, and below 768px it is a fixed drawer that adds no height to
 * `#storybook-root`. `Expanded` is the full column on desktop and the open
 * drawer on mobile; `Collapsed` is the rail on desktop and a closed drawer —
 * an empty page — on mobile. Sidebar.test.tsx holds the tag equal to
 * `FULLPAGE_TAG`; it is a literal because Storybook indexes CSF statically.
 */
const meta = {
  title: 'Organisms/Sidebar',
  component: Sidebar,
  tags: ['visual-diff:fullpage'],
  parameters: {
    layout: 'fullscreen',
    docs: { story: { inline: false, iframeHeight: 640 } },
  },
  args: {
    id: 'census-sidebar',
    repository: 'acceptance-gate',
    title: 'pyramid',
    collapsed: false,
    onCollapsedChange: () => {},
    dimensions: [
      { id: 'overview', label: 'Overview', href: '/', count: 23, current: true },
      { id: 'code', label: 'Unit', href: '/?dimension=code', count: 9 },
      { id: 'visual', label: 'Component', href: '/?dimension=visual', count: 12 },
      { id: 'acceptance', label: 'Acceptance', href: '/?dimension=acceptance', count: 2 },
      { id: 'health', label: 'Health', href: '/?dimension=health', count: 0 },
    ],
    workspaces: [
      { name: '@gate/ui', href: '/packages-ui', category: 'packages', status: 'clear' },
      {
        name: '@gate/links',
        href: '/packages-links',
        category: 'packages',
        status: 'gaps',
      },
      {
        name: '@gate/logger',
        href: '/packages-logger',
        category: 'packages',
        status: 'gaps',
      },
      {
        name: '@gate/visual-diff',
        href: '/packages-visual-diff',
        category: 'packages',
        status: 'gaps',
      },
      {
        name: '@gate/tsconfig',
        href: '/packages-tsconfig',
        category: 'packages',
        status: 'unmeasured',
      },
      {
        name: '@gate/visual-diff-ui',
        href: '/apps-visual-diff-ui',
        category: 'apps',
        status: 'clear',
      },
      { name: '@gate/blog', href: '/apps-blog', category: 'apps', status: 'gaps' },
      { name: '@gate/e2e', href: '/apps-e2e', category: 'apps', status: 'gaps' },
      { name: '@gate/manual', href: '/apps-manual', category: 'apps', status: 'gaps' },
      {
        name: '@gate/storybook',
        href: '/apps-storybook',
        category: 'apps',
        status: 'gaps',
      },
      { name: 'scripts/', href: '/scripts', category: 'scripts', status: 'gaps' },
    ],
  },
} satisfies Meta<typeof Sidebar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Expanded: Story = {};

export const Collapsed: Story = {
  args: { collapsed: true },
};
