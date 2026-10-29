import type { Meta, StoryObj } from '@storybook/react';

import { Pagination } from './Pagination';

const meta: Meta<typeof Pagination> = {
  title: 'Molecules/Pagination',
  component: Pagination,
};

export default meta;

/** The box an absent render is shot in. `#storybook-root` already spans the
 *  viewport but has no height when the story leaves no ink, so this frame lends it
 *  one — a minimum, never a fixed height, so anything that does start rendering
 *  grows the shot instead of being cropped out of it. */
const ABSENCE_FRAME = { minBlockSize: 'var(--space-8)' };

type Story = StoryObj<typeof Pagination>;

/** The four states 02-molecules draws, in the order the tile stacks them. */
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
// empty <nav>. Shot inside the absence frame, so the baseline is an empty box —
// an empty <nav> with padding, or any stray control, would change it.
export const SinglePage: Story = {
  args: { page: 1, pageCount: 1 },
  decorators: [
    (Story) => (
      <div style={ABSENCE_FRAME}>
        <Story />
      </div>
    ),
  ],
};
