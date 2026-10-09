import type { Meta, StoryObj } from '@storybook/react';

import { Pagination } from '../../molecules/Pagination/Pagination';
import { BlogIndexTemplate } from './BlogIndexTemplate';

const meta = {
  title: 'Templates/BlogIndexTemplate',
  component: BlogIndexTemplate,
} satisfies Meta<typeof BlogIndexTemplate>;

export default meta;

type Story = StoryObj<typeof meta>;

const POSTS = [
  {
    title: 'Visual regression with agents',
    description: 'What breaks when an autonomous pipeline owns your pixels.',
    href: '/blog/visual-regression-with-agents',
    date: '2026-08-01',
    readingMinutes: 7,
    tags: ['testing', 'agents'],
  },
  {
    title: 'A design system with no framework',
    description: 'Why packages/ui imports neither next nor a router.',
    href: '/blog/a-design-system-with-no-framework',
    date: '2026-06-12',
    readingMinutes: 5,
    tags: ['design-system'],
  },
  {
    title: 'Deterministic stories, deterministic baselines',
    description: 'Every story here is a fixture, not a snapshot of the clock.',
    href: '/blog/deterministic-stories-deterministic-baselines',
    date: '2026-03-20',
    readingMinutes: 4,
    tags: ['storybook', 'ci'],
  },
];

export const ThreePosts: Story = {
  args: {
    title: 'Blog',
    posts: POSTS,
  },
};

export const Empty: Story = {
  args: {
    title: 'Blog',
    posts: [],
  },
};

export const WithIntro: Story = {
  args: {
    title: 'Posts tagged agents',
    intro: 'Every post here touches the pipeline that captures this baseline.',
    posts: POSTS.slice(0, 2),
  },
};

/** Page 2 of 3 — what `/blog/page/2` draws: the position in the intro, the control under the list. */
export const Paged: Story = {
  args: {
    title: 'Blog',
    intro: 'Page 2 of 3',
    posts: POSTS,
    pagination: <Pagination page={2} pageCount={3} />,
  },
};
