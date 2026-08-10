import type { Meta, StoryObj } from '@storybook/react';

import { Button } from '../Button/Button';
import { EmptyState } from './EmptyState';

const meta: Meta<typeof EmptyState> = {
  title: 'Atoms/EmptyState',
  component: EmptyState,
};

export default meta;

type Story = StoryObj<typeof EmptyState>;

export const MessageOnly: Story = {
  args: { message: 'No posts for this tag.' },
};

const icon = (
  <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true">
    <path d="M12 3 1 21h22L12 3Zm0 6 6.5 10h-13L12 9Z" />
  </svg>
);

export const WithIcon: Story = {
  args: { message: 'No posts for this tag.', icon },
};

export const WithIconAndAction: Story = {
  args: {
    message: 'No posts for this tag.',
    icon,
    action: <Button variant="secondary">Clear filter</Button>,
  },
};
