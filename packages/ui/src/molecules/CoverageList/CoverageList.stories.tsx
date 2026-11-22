import type { Meta, StoryObj } from '@storybook/react';

import { CoverageList } from './CoverageList';

const meta: Meta<typeof CoverageList> = {
  title: 'Molecules/CoverageList',
  component: CoverageList,
};

export default meta;

type Story = StoryObj<typeof CoverageList>;

export const Default: Story = {
  args: {
    title: 'Repository coverage',
    description:
      'How much of the repository each dimension covers. Gaps are what is left.',
    window: '30 d',
    rows: [
      {
        dimension: 'code',
        name: 'Code',
        detail: 'lines covered · unmeasured workspaces count as 0',
        value: 31,
        delta: 7,
      },
      {
        dimension: 'visual',
        name: 'Visual',
        detail: '37 of 49 with story · tile · baseline',
        value: 76,
        delta: 7,
      },
      {
        dimension: 'acceptance',
        name: 'Acceptance',
        detail: '2 of 4 apps a scenario visits',
        value: 50,
        delta: 25,
      },
      {
        dimension: 'health',
        name: 'Health',
        detail: '10 of 11 scopes under the complexity ceiling',
        value: 91,
        delta: 9,
      },
    ],
  },
};
