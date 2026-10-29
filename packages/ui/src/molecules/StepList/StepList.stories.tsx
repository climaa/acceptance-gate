import type { Meta, StoryObj } from '@storybook/react';

import { StepList } from './StepList';

const meta: Meta<typeof StepList> = {
  title: 'Molecules/StepList',
  component: StepList,
};

export default meta;

/** The box an absent render is shot in. `#storybook-root` already spans the
 *  viewport but has no height when the story leaves no ink, so this frame lends it
 *  one — a minimum, never a fixed height, so anything that does start rendering
 *  grows the shot instead of being cropped out of it. */
const ABSENCE_FRAME = { minBlockSize: 'var(--space-8)' };

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
// empty list. Shot inside the absence frame, so the baseline is an empty box —
// an empty <ol> with its margins would change it.
export const Empty: Story = {
  args: { steps: [] },
  decorators: [
    (Story) => (
      <div style={ABSENCE_FRAME}>
        <Story />
      </div>
    ),
  ],
};
