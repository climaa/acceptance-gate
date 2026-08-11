import type { Meta, StoryObj } from '@storybook/react';

import { SkipLink } from './SkipLink';

const meta: Meta<typeof SkipLink> = {
  title: 'Atoms/SkipLink',
  component: SkipLink,
};

export default meta;

type Story = StoryObj<typeof SkipLink>;

// Unfocused, `.ds-visually-hidden` clips the link to nothing — there is no box for
// visual-diff to capture, and there is nothing else this story could show. The
// revealed appearance is baselined by `Revealed` below instead.
export const Default: Story = {
  tags: ['visual-diff:skip'],
};

/**
 * `.ds-skip-link` is visually hidden until it receives focus. A real `.focus()` call
 * would reveal it via `:focus-visible`, but that selector is unreliable under
 * programmatic focus in a capture context — so this forces the same revealed
 * appearance deterministically via `--force-visible` instead of relying on focus
 * heuristics at all.
 */
export const Revealed: Story = {
  args: {
    className: 'ds-skip-link--force-visible',
  },
};
