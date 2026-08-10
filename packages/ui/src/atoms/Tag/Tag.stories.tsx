import type { Meta, StoryObj } from '@storybook/react';

import { Tag } from './Tag';

const meta: Meta<typeof Tag> = {
  title: 'Atoms/Tag',
  component: Tag,
};

export default meta;

type Story = StoryObj<typeof Tag>;

export const Default: Story = {
  args: { href: '/tags/react', children: 'react' },
};

export const LabelWithSpace: Story = {
  args: { href: '/tags/visual-regression', children: 'visual regression' },
};
