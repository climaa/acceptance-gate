import type { Meta, StoryObj } from '@storybook/react';

import { SkipLink } from './SkipLink';

const meta: Meta<typeof SkipLink> = {
  title: 'Atoms/SkipLink',
  component: SkipLink,
};

export default meta;

/** The box an absent render is shot in. `#storybook-root` already spans the
 *  viewport but has no height when the story leaves no ink, so this frame lends it
 *  one — a minimum, never a fixed height, so anything that does start rendering
 *  grows the shot instead of being cropped out of it. */
const ABSENCE_FRAME = { minBlockSize: 'var(--space-8)' };

type Story = StoryObj<typeof SkipLink>;

// Unfocused, `.ds-visually-hidden` clips the link to nothing, so the shot is the
// empty absence frame — and that emptiness is the assertion: a link that leaks out
// of its clip lands ink in it. The revealed appearance is baselined by `Revealed`.
export const Default: Story = {
  decorators: [
    (Story) => (
      <div style={ABSENCE_FRAME}>
        <Story />
      </div>
    ),
  ],
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
