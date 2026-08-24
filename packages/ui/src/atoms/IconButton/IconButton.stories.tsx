import type { Meta, StoryObj } from '@storybook/react';

import { IconButton } from './IconButton';

/**
 * The glyph Board 01 draws in this tile — lucide's `wand-sparkles`, stroked, the
 * way `Dialog`'s close is stroked. It is a sample rather than part of the atom:
 * `IconButton` takes whatever glyph it is handed, and the one the visual-diff
 * console hands it lives with the panel that has a reason to.
 */
const Wand = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" />
    <path d="m14 7 3 3" />
    <path d="M5 6v4" />
    <path d="M19 14v4" />
    <path d="M10 2v2" />
    <path d="M7 8H3" />
    <path d="M21 16h-4" />
    <path d="M11 3H9" />
  </svg>
);

const meta: Meta<typeof IconButton> = {
  title: 'Atoms/IconButton',
  component: IconButton,
  args: { label: 'suggest a label', children: <Wand /> },
};

export default meta;

type Story = StoryObj<typeof IconButton>;

/**
 * Every cell of the variant × size grid gets a story, which is NOT what
 * `Button.stories.tsx` beside it does — that file states the other convention
 * outright, keeping one story per variant at the default size and adding the
 * sizes once. Two variants and two sizes is a small enough grid to draw whole,
 * and every cell is a captured baseline; if that trade stops being worth it,
 * collapsing to Button's shape is the change to make.
 */
export const Secondary: Story = {
  args: { variant: 'secondary' },
};

export const SecondarySmall: Story = {
  args: { variant: 'secondary', size: 'sm' },
};

export const Ghost: Story = {
  args: { variant: 'ghost' },
};

export const GhostSmall: Story = {
  args: { variant: 'ghost', size: 'sm' },
};

export const Disabled: Story = {
  args: { variant: 'secondary', disabled: true },
};
