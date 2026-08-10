import type { Meta, StoryObj } from '@storybook/react';

import { Button } from './Button';

const meta: Meta<typeof Button> = {
  title: 'Atoms/Button',
  component: Button,
};

export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: { variant: 'primary', children: 'Save changes' },
};

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Save changes' },
};

export const Ghost: Story = {
  args: { variant: 'ghost', children: 'Save changes' },
};

export const Danger: Story = {
  args: { variant: 'danger', children: 'Delete post' },
};

// `Primary` above already renders the default `md` size — this pair is the
// other two sizes the board names, not a third medium-sized duplicate.
export const Small: Story = {
  args: { variant: 'primary', size: 'sm', children: 'Save changes' },
};

export const Large: Story = {
  args: { variant: 'primary', size: 'lg', children: 'Save changes' },
};

export const Disabled: Story = {
  args: { variant: 'primary', disabled: true, children: 'Save changes' },
};
