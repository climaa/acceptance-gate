import type { Meta, StoryObj } from '@storybook/react';

import { TagList } from './TagList';

const meta: Meta<typeof TagList> = {
  title: 'Molecules/TagList',
  component: TagList,
};

export default meta;

type Story = StoryObj<typeof TagList>;

export const ThreeTags: Story = {
  args: {
    tags: ['testing', 'agents', 'ci'],
  },
};

export const OneTag: Story = {
  args: {
    tags: ['testing'],
  },
};

// The edge case TagList.test.tsx pins: an empty array renders nothing at all,
// not an empty <ul>. Skipped from visual-diff for the same reason: `null` leaves
// no `#storybook-root` box for the capturer to shoot — there is nothing to capture,
// and no alternate "revealed" state to baseline instead (unlike SkipLink's unfocused
// Default, an empty tag list has no state where anything renders).
export const Empty: Story = {
  args: {
    tags: [],
  },
  tags: ['visual-diff:skip'],
};
