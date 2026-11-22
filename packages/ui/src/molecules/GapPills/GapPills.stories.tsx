import type { Meta, StoryObj } from '@storybook/react';

import { GapPills } from './GapPills';

const meta: Meta<typeof GapPills> = {
  title: 'Molecules/GapPills',
  component: GapPills,
};

export default meta;

type Story = StoryObj<typeof GapPills>;

export const Default: Story = {
  args: {
    gaps: [
      { dimension: 'code', label: 'code', count: 9 },
      { dimension: 'visual', label: 'visual', count: 12 },
      { dimension: 'acceptance', label: 'accept.', count: 2 },
      { dimension: 'health', label: 'health', count: 0 },
    ],
  },
};
