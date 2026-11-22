import type { Meta, StoryObj } from '@storybook/react';

import { SparkStat } from './SparkStat';

/** Thirty days of the count, falling from 10 to 7 in the steps the board draws. */
const LEVELS = [7, 7, 6, 6, 5, 5, 4, 4, 3, 2, 1, 1, 0];
const SERIES = LEVELS.map((level) => 7 + (3 * level) / 7);

const meta: Meta<typeof SparkStat> = {
  title: 'Molecules/SparkStat',
  component: SparkStat,
  decorators: [
    (Story) => (
      <div style={{ inlineSize: '230px' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SparkStat>;

export const Default: Story = {
  args: {
    label: 'CRAP ≥ 30',
    value: '7',
    delta: -3,
    better: 'down',
    window: 'in 30 days',
    series: SERIES,
  },
};
