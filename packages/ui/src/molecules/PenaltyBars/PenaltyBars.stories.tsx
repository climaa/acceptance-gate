import type { Meta, StoryObj } from '@storybook/react';

import { PenaltyBars } from './PenaltyBars';

const meta: Meta<typeof PenaltyBars> = {
  title: 'Molecules/PenaltyBars',
  component: PenaltyBars,
};

export default meta;

type Story = StoryObj<typeof PenaltyBars>;

export const Default: Story = {
  args: {
    title: 'What costs points',
    penalties: [
      { name: 'Function size', points: 10 },
      { name: 'Coupling', points: 1.8 },
      { name: 'Maintainability', points: 1.4 },
      { name: 'Dead files', points: 1.2 },
      { name: 'Dead exports', points: 0.9 },
      { name: 'Complexity', points: 0 },
      { name: 'Duplication', points: 0 },
      { name: 'Cycles', points: 0 },
      { name: 'Unused dependencies', points: 0 },
      { name: 'Hotspots', points: 0 },
    ],
  },
};
