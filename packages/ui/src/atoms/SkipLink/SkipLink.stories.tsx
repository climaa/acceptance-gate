import type { Decorator, Meta, StoryObj } from '@storybook/react';
import { useEffect, useRef } from 'react';

import { SkipLink } from './SkipLink';

const meta: Meta<typeof SkipLink> = {
  title: 'Atoms/SkipLink',
  component: SkipLink,
};

export default meta;

type Story = StoryObj<typeof SkipLink>;

export const Default: Story = {};

/**
 * `.ds-skip-link` is visually hidden until it receives focus, so an unfocused
 * baseline captures nothing — this decorator focuses the rendered anchor on
 * mount, giving the differ a frame where the reveal is actually visible.
 */
const withFocus: Decorator = (Story) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector('a')?.focus();
  }, []);

  return <div ref={ref}>{Story()}</div>;
};

export const Focused: Story = {
  decorators: [withFocus],
};
