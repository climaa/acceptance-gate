import type { Meta, StoryObj } from '@storybook/react';

import { Skeleton } from './Skeleton';

const meta: Meta<typeof Skeleton> = {
  title: 'Atoms/Skeleton',
  component: Skeleton,
};

export default meta;

type Story = StoryObj<typeof Skeleton>;

export const Line: Story = {
  args: { variant: 'line', width: 12 },
};

export const Block: Story = {
  args: { variant: 'block', width: 16, height: 10 },
};

export const MultiLineGroup: Story = {
  args: { lines: 3, width: 12 },
};
