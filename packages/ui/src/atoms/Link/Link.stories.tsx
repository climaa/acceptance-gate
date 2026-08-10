import type { Meta, StoryObj } from '@storybook/react';

import { Link } from './Link';

const meta: Meta<typeof Link> = {
  title: 'Atoms/Link',
  component: Link,
};

export default meta;

type Story = StoryObj<typeof Link>;

export const Default: Story = {
  args: { tone: 'default', href: '/blog', children: 'Read the post' },
};

export const Muted: Story = {
  args: { tone: 'muted', href: '/blog', children: 'Read the post' },
};
