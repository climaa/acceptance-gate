import type { Meta, StoryObj } from '@storybook/react';

import { ProfileBar } from './ProfileBar';

const meta: Meta<typeof ProfileBar> = {
  title: 'Molecules/ProfileBar',
  component: ProfileBar,
};

export default meta;

type Story = StoryObj<typeof ProfileBar>;

export const Default: Story = {
  args: {
    title: 'Function size',
    unit: 'lines per function',
    shares: [83.7, 9, 4.4, 2.8],
  },
};
