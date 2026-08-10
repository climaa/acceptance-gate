import type { Decorator, Meta, StoryObj } from '@storybook/react';
import { useEffect } from 'react';

import { ThemeToggle } from './ThemeToggle';

const meta: Meta<typeof ThemeToggle> = {
  title: 'Atoms/ThemeToggle',
  component: ThemeToggle,
};

export default meta;

type Story = StoryObj<typeof ThemeToggle>;

/**
 * The component writes `data-theme` on `<html>` when clicked, and Storybook
 * does not reset that element between stories. Nothing in this story clicks
 * it, but the cleanup guards the next story regardless of how a reader who
 * opens this one by hand leaves it.
 */
const withThemeReset: Decorator = (Story) => {
  useEffect(() => {
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, []);

  return Story();
};

export const Default: Story = {
  decorators: [withThemeReset],
};
