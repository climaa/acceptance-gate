import type { Meta, StoryObj } from '@storybook/react';

import { TriStateCheckbox } from './TriStateCheckbox';

const meta: Meta<typeof TriStateCheckbox> = {
  title: 'Atoms/TriStateCheckbox',
  component: TriStateCheckbox,
};

export default meta;

type Story = StoryObj<typeof TriStateCheckbox>;

/** The three states side by side, exactly as Board 01 draws them. The control
 *  is controlled, so a capture of one state per story would need three stories
 *  and three baselines to show what one deterministic row already shows. */
export const States: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <TriStateCheckbox checked={false} label="None selected" onChange={() => {}} />
      <TriStateCheckbox
        checked={false}
        indeterminate
        label="Some selected"
        onChange={() => {}}
      />
      <TriStateCheckbox checked label="All selected" onChange={() => {}} />
    </div>
  ),
};
