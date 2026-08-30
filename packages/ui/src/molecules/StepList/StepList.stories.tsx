import type { Meta, StoryObj } from '@storybook/react';

import { StepList } from './StepList';

const meta: Meta<typeof StepList> = {
  title: 'Molecules/StepList',
  component: StepList,
};

export default meta;

type Story = StoryObj<typeof StepList>;

/**
 * The state the manual actually renders, and the one the board draws: a run per
 * act, with each conjunction inside the run it continues. The `And` here sits
 * under `Then`, so it reads as another thing you see rather than another thing
 * you do — which is the entire argument for carrying the meanings.
 */
export const Scenario: Story = {
  args: {
    steps: [
      { keyword: 'When', meaning: 'Action', text: 'I visit the console' },
      {
        keyword: 'Then',
        meaning: 'Outcome',
        text: 'I see each screenshot set with its branch, story count and size',
      },
      {
        keyword: 'And',
        meaning: 'Conjunction',
        text: 'a set captured from a dirty tree is marked as dirty',
      },
    ],
  },
};

// No story for the untyped fallback, deliberately. It renders — the same steps in
// the same order, as a plain numbered list — and StepList.test.tsx covers it. But
// a molecule costs two baselines per story and the plan budgets two here, so a
// second captured story would double that, while skipping it would put a
// capturable state into a contract whose every entry means "cannot be captured".
// Neither is worth a prop permutation nothing renders today.

// The edge case StepList.test.tsx pins: no steps renders nothing at all, not an
// empty list. Skipped for the reason TagList's Empty is — `null` leaves no
// `#storybook-root` box to shoot, and there is no alternate state to baseline.
export const Empty: Story = {
  args: { steps: [] },
  tags: ['visual-diff:skip'],
};
