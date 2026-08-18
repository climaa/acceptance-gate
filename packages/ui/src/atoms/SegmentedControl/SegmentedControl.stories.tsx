import type { Meta, StoryObj } from '@storybook/react';

import { SegmentedControl } from './SegmentedControl';

const meta: Meta<typeof SegmentedControl> = {
  title: 'Atoms/SegmentedControl',
  component: SegmentedControl,
};

export default meta;

type Story = StoryObj<typeof SegmentedControl>;

/** Fixed options, a fixed selection and a no-op handler: the capture has to
 *  land on the same pixels every run, and the middle segment is the one that
 *  shows both a left and a right neighbour of the pressed state. */
export const Default: Story = {
  args: {
    label: 'Comparison mode',
    options: [
      { value: 'side-by-side', label: 'Side by side' },
      { value: 'overlay', label: 'Overlay' },
      { value: 'diff', label: 'Diff' },
    ],
    value: 'overlay',
    onChange: () => {},
  },
};
