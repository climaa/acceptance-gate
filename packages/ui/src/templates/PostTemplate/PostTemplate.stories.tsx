import type { Meta, StoryObj } from '@storybook/react';

import { PostTemplate } from './PostTemplate';

const meta = {
  title: 'Templates/PostTemplate',
  component: PostTemplate,
} satisfies Meta<typeof PostTemplate>;

export default meta;

type Story = StoryObj<typeof meta>;

// Plain JSX, not an MDX import — PostTemplate has no MDX knowledge, and MDX
// would be unrenderable here in the first place.
export const Default: Story = {
  args: {
    title: 'Visual regression with agents',
    date: '2026-08-01',
    readingMinutes: 7,
    tags: ['testing', 'agents'],
    children: (
      <>
        <h2>What changed</h2>
        <p>
          A visual-diff gate compares a screenshot against a baseline and fails the build
          on a pixel difference past its threshold.
        </p>
        <h2>Why it matters</h2>
        <p>
          A component library with no capture step ships a spacing regression the same way
          it ships a bug fix — silently.
        </p>
      </>
    ),
  },
};
