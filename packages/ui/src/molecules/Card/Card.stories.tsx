import type { Meta, StoryObj } from '@storybook/react';

import { Card, CardHeader, CardTitle } from './Card';

const meta: Meta<typeof Card> = {
  title: 'Molecules/Card',
  component: Card,
};

export default meta;

type Story = StoryObj<typeof Card>;

export const Default: Story = {
  args: {
    children: 'Card body copy sits here, unstyled beyond the shell.',
  },
};

export const Padded: Story = {
  args: {
    padded: true,
    children: 'Padded is the default, shown explicitly for the baseline.',
  },
};

export const Interactive: Story = {
  args: {
    interactive: true,
    children: 'Hover raises this card — the shape PostCard builds on.',
  },
};

export const WithHeaderTitle: Story = {
  render: (args) => (
    <Card {...args}>
      <CardHeader>
        <CardTitle>Deploys</CardTitle>
      </CardHeader>
      <p>Three shipped today.</p>
    </Card>
  ),
};
