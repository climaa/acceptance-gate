import type { Meta, StoryObj } from '@storybook/react';

import { StatePies } from './StatePies';

const meta: Meta<typeof StatePies> = {
  title: 'Molecules/StatePies',
  component: StatePies,
};

export default meta;

type Story = StoryObj<typeof StatePies>;

export const Default: Story = {
  args: {
    states: [
      { name: 'loading', own: 3, inherited: 1, none: 13 },
      { name: 'error', own: 0, inherited: 17, none: 0 },
      { name: 'not-found', own: 0, inherited: 17, none: 0 },
    ],
  },
};
