import type { Meta, StoryObj } from '@storybook/react';

import { Pagination } from './Pagination';

const meta: Meta<typeof Pagination> = {
  title: 'Molecules/Pagination',
  component: Pagination,
};

export default meta;

type Story = StoryObj<typeof Pagination>;

/** The four states Board 01 draws, in the order the tile stacks them. */
export const FirstPage: Story = {
  args: { page: 1, pageCount: 3 },
};

export const MiddlePage: Story = {
  args: { page: 2, pageCount: 3 },
};

export const LastPage: Story = {
  args: { page: 3, pageCount: 3 },
};

/** Page 7 of 12: first, last and one neighbour each side stay; each gap is one ellipsis. */
export const Window: Story = {
  args: { page: 7, pageCount: 12 },
};

// The edge case Pagination.test.tsx pins: one page renders nothing at all, not an
// empty <nav>. Skipped from visual-diff for the same reason TagList's Empty is:
// `null` leaves no `#storybook-root` box for the capturer to shoot, and there is
// no alternate state of this story that renders instead.
export const SinglePage: Story = {
  args: { page: 1, pageCount: 1 },
  tags: ['visual-diff:skip'],
};
