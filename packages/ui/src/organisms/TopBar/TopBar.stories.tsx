import type { Meta, StoryObj } from '@storybook/react';

import { TopBar } from './TopBar';

const meta = {
  title: 'Organisms/TopBar',
  component: TopBar,
} satisfies Meta<typeof TopBar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    breadcrumb: [
      { label: 'acceptance-gate', href: '/' },
      { label: 'pyramid', href: '/pyramid' },
      { label: 'Overview' },
    ],
    githubHref: 'https://github.com/climaa/acceptance-gate',
    onSearch: () => {},
    onMenuClick: () => {},
    menuExpanded: false,
    menuControls: 'census-sidebar',
  },
};
