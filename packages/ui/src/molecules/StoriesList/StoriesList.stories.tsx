import type { Meta, StoryObj } from '@storybook/react';

import { StoriesList } from './StoriesList';

/** Thirty-four more console components past the five the row names. */
const MORE = Array.from({ length: 34 }, (_, i) => `ConsolePart${i + 1}`);

const meta: Meta<typeof StoriesList> = {
  title: 'Molecules/StoriesList',
  component: StoriesList,
};

export default meta;

type Story = StoryObj<typeof StoriesList>;

export const Default: Story = {
  args: {
    workspaces: [
      { name: '@gate/ui', total: 31, missing: ['Stack'] },
      {
        name: '@gate/visual-diff-ui',
        total: 44,
        missing: [
          'RunPanel',
          'Note',
          'ConfirmDialogs',
          'SetFilterBar',
          'OverlayStage',
          ...MORE,
        ],
      },
      {
        name: '@gate/blog',
        total: 11,
        missing: [
          'MermaidDiagram',
          'LottieBlock',
          'BlogFrame',
          'ChangelogSyncStill',
          'ChangelogSyncButton',
        ],
      },
      { name: '@gate/manual', total: 4, missing: ['ManualFrame'] },
    ],
  },
};
