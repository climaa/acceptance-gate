import type { Meta, StoryObj } from '@storybook/react';

import { PostCard } from './PostCard';

const meta: Meta<typeof PostCard> = {
  title: 'Molecules/PostCard',
  component: PostCard,
};

export default meta;

type Story = StoryObj<typeof PostCard>;

// Tags present on purpose: the stretched-link pattern makes the whole card one
// link target while these chips stay independently clickable, and that's the
// layout the Wave 4 baseline needs to cover.
export const Default: Story = {
  args: {
    title: 'Visual regression with agents',
    description: 'What breaks when an autonomous pipeline owns your pixels.',
    href: '/blog/visual-regression-with-agents',
    date: '2026-08-01',
    readingMinutes: 7,
    tags: ['testing', 'agents'],
  },
};

// The home page renders these under an existing <h2>, so it needs <h3>.
export const HeadingLevelH3: Story = {
  args: {
    ...Default.args,
    headingLevel: 'h3',
  },
};

export const LongTitleWraps: Story = {
  args: {
    ...Default.args,
    title:
      'Why a stretched-link card without nested anchors is the only pattern that keeps tag chips independently clickable',
    description:
      'A long title has to wrap onto multiple lines without breaking the card layout or overlapping the meta and tags below it.',
  },
};
