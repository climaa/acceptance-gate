import type { Meta, StoryObj } from '@storybook/react';

import { SiteFooter } from './SiteFooter';

const meta = {
  title: 'Organisms/SiteFooter',
  component: SiteFooter,
} satisfies Meta<typeof SiteFooter>;

export default meta;

type Story = StoryObj<typeof meta>;

// The year is a literal, never `new Date().getFullYear()` — see SiteFooter's own
// determinism note. A live year would make this baseline churn on 1 January.
export const Default: Story = {
  args: {
    copyright: 'Carlos Lima',
    year: 2026,
    links: [
      { label: 'RSS', href: '/rss.xml' },
      { label: 'GitHub', href: 'https://github.com/gate' },
    ],
  },
};
