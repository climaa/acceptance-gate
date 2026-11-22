import type { Meta, StoryObj } from '@storybook/react';

import { TestPyramid } from './TestPyramid';

const meta: Meta<typeof TestPyramid> = {
  title: 'Molecules/TestPyramid',
  component: TestPyramid,
};

export default meta;

type Story = StoryObj<typeof TestPyramid>;

export const Default: Story = {
  args: {
    bands: [
      { dimension: 'code', label: 'Code · vitest cases', count: 3550 },
      { dimension: 'visual', label: 'Visual · screenshots', count: 286 },
      { dimension: 'acceptance', label: 'Acceptance · scenarios', count: 88 },
    ],
  },
};
