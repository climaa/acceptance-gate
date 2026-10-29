import type { Meta, StoryObj } from '@storybook/react';

import { TagList } from './TagList';

const meta: Meta<typeof TagList> = {
  title: 'Molecules/TagList',
  component: TagList,
};

export default meta;

/** The box an absent render is shot in. `#storybook-root` already spans the
 *  viewport but has no height when the story leaves no ink, so this frame lends it
 *  one — a minimum, never a fixed height, so anything that does start rendering
 *  grows the shot instead of being cropped out of it. */
const ABSENCE_FRAME = { minBlockSize: 'var(--space-8)' };

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
// not an empty <ul>. Shot inside the absence frame, so the baseline is an empty
// box — an empty <ul> with its gap and margins would change it.
export const Empty: Story = {
  args: {
    tags: [],
  },
  decorators: [
    (Story) => (
      <div style={ABSENCE_FRAME}>
        <Story />
      </div>
    ),
  ],
};
