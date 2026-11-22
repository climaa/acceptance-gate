import type { Meta, StoryObj } from '@storybook/react';

import { Meter } from './Meter';

const meta: Meta<typeof Meter> = {
  title: 'Atoms/Meter',
  component: Meter,
  args: { label: 'Code coverage', hue: 'chart' },
};

export default meta;

type Story = StoryObj<typeof Meter>;

export const Partial: Story = {
  args: { value: 18 },
};

export const Full: Story = {
  args: { value: 100 },
};

export const Empty: Story = {
  args: { value: 0 },
};

export const Unmeasured: Story = {
  args: { value: null },
};
