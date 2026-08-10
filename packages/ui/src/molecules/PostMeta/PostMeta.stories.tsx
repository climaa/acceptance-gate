import type { Meta, StoryObj } from '@storybook/react';

import { PostMeta } from './PostMeta';

const meta: Meta<typeof PostMeta> = {
  title: 'Molecules/PostMeta',
  component: PostMeta,
};

export default meta;

type Story = StoryObj<typeof PostMeta>;

export const Default: Story = {
  args: {
    date: '2026-08-09',
    readingMinutes: 7,
  },
};

// The wording edge case PostMeta.test.tsx pins: "1 min", never "1 mins".
export const OneMinuteRead: Story = {
  args: {
    date: '2026-08-09',
    readingMinutes: 1,
  },
};
