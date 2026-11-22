import type { Meta, StoryObj } from '@storybook/react';

import { Hotspots, type Hotspot } from './Hotspots';

const meta: Meta<typeof Hotspots> = {
  title: 'Molecules/Hotspots',
  component: Hotspots,
};

export default meta;

type Story = StoryObj<typeof Hotspots>;

/** Weighted by lines, so the dots span the board's 16–28px. */
const FILES: Hotspot[] = [
  {
    path: 'board-scale-integrity.mjs',
    churn: 13,
    complexity: 0.23,
    weight: 240,
    hot: true,
    label: 'end',
  },
  {
    path: 'policy.test.mjs',
    churn: 11,
    complexity: 0.23,
    weight: 200,
    hot: true,
    label: 'start',
  },
  {
    path: 'comparison.ts',
    churn: 13,
    complexity: 0.16,
    weight: 180,
    hot: true,
    label: 'end',
  },
  { path: 'RunPanel.tsx', churn: 26, complexity: 0.11, weight: 280 },
  { path: 'console.test.tsx', churn: 22, complexity: 0.12, weight: 260 },
  { path: 'main.mts', churn: 23, complexity: 0.11, weight: 240 },
  { path: 'shot-tools.test.tsx', churn: 14, complexity: 0.12, weight: 200 },
  { path: 'pages.test.ts', churn: 9, complexity: 0.2, weight: 160 },
  { path: 'policy.mjs', churn: 19, complexity: 0.1, weight: 200 },
  { path: 'CurrentJob.tsx', churn: 15, complexity: 0.15, weight: 220, hot: true },
];

export const Default: Story = {
  args: {
    hotspots: FILES,
    xLabel: 'commits in 6 months →',
    yLabel: 'complexity density ↑',
    quadrantLabel: 'refactor here',
    label: 'Hotspots by churn and complexity',
  },
};
