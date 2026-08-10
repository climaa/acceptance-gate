import type { Meta, StoryObj } from '@storybook/react';

import { Badge } from './Badge';

const meta: Meta<typeof Badge> = {
  title: 'Atoms/Badge',
  component: Badge,
};

export default meta;

type Story = StoryObj<typeof Badge>;

export const Neutral: Story = {
  args: { tone: 'neutral', children: 'Draft' },
};

export const Accent: Story = {
  args: { tone: 'accent', children: 'Blog' },
};

export const Success: Story = {
  args: { tone: 'success', children: 'Published' },
};

export const Warning: Story = {
  args: { tone: 'warning', children: 'Review' },
};

export const Danger: Story = {
  args: { tone: 'danger', children: 'Deprecated' },
};
