import type { Meta, StoryObj } from '@storybook/react';

import { Spinner } from './Spinner';

const meta: Meta<typeof Spinner> = {
  title: 'Atoms/Spinner',
  component: Spinner,
};

export default meta;

type Story = StoryObj<typeof Spinner>;

export const Default: Story = {};

/**
 * The ring takes the size and the colour of the text it stands beside — one `em`
 * across, lit segment in `currentColor` — which is why the atom needs no size
 * prop and no tone. This is the shape the console actually renders: the status
 * word in the accent role, with the ring turning in front of it.
 *
 * Both values arrive as token references rather than lengths and literals: a
 * story is the one place a raw `1rem` would go unnoticed by the sheet tests.
 */
export const BesideText: Story = {
  render: () => (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        color: 'var(--color-accent)',
        fontSize: 'var(--text-sm)',
        fontWeight: 'var(--weight-bold)',
      }}
    >
      <Spinner />
      running
    </span>
  ),
};
