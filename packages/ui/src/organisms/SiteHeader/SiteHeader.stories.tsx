import type { Meta, StoryObj } from '@storybook/react';

import { SiteHeader } from './SiteHeader';

const meta = {
  title: 'Organisms/SiteHeader',
  component: SiteHeader,
} satisfies Meta<typeof SiteHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    brand: 'Gate',
    nav: [
      { label: 'Blog', href: '/blog' },
      { label: 'Tags', href: '/tags' },
      { label: 'About', href: '/about' },
    ],
  },
};

export const EmptyNav: Story = {
  args: {
    brand: 'Gate',
    nav: [],
  },
};
