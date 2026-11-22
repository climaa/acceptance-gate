import type { Meta, StoryObj } from '@storybook/react';

import { StatTile } from './StatTile';

const meta: Meta<typeof StatTile> = {
  title: 'Molecules/StatTile',
  component: StatTile,
  decorators: [
    (Story) => (
      <div style={{ inlineSize: '270px' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof StatTile>;

export const Measured: Story = {
  args: {
    label: 'Unit',
    value: '98.9%',
    detail: '349 of 353 lines · floor 70',
    state: 'measured',
    meter: { label: 'Unit coverage', value: 98.9, hue: 'chart' },
  },
};

export const Gaps: Story = {
  args: {
    label: 'Gaps',
    value: '23',
    detail: '9 unit · 12 component · 2 acceptance',
    state: 'gaps',
  },
};

export const Unmeasured: Story = {
  args: {
    label: 'Unit',
    value: 'none',
    detail: '29 test files, no coverage measured',
    state: 'unmeasured',
    meter: { label: 'Unit coverage', value: null },
  },
};

export const NotApplicable: Story = {
  args: {
    label: 'Acceptance',
    value: '—',
    detail: 'A package is not a deployed app.',
    state: 'not-applicable',
  },
};
