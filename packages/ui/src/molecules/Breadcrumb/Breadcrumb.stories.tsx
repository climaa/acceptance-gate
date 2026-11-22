import type { Meta, StoryObj } from '@storybook/react';

import { Breadcrumb } from './Breadcrumb';

const meta: Meta<typeof Breadcrumb> = {
  title: 'Molecules/Breadcrumb',
  component: Breadcrumb,
};

export default meta;

type Story = StoryObj<typeof Breadcrumb>;

export const Path: Story = {
  args: {
    items: [
      { label: 'acceptance-gate', href: '/' },
      { label: 'packages', href: '/?group=packages' },
      { label: '@gate/ui', href: '/ui' },
    ],
  },
};

/** A filtered view: the filter's scope, then the value it is set to. */
export const Filter: Story = {
  args: {
    items: [{ label: 'All layers', href: '/' }, { label: 'Unit' }],
  },
};
