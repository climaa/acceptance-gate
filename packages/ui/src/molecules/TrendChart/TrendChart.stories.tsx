import type { Meta, StoryObj } from '@storybook/react';

import { TrendChart, type TrendPoint } from './TrendChart';

/** Thirteen measurements across the 90 days up to 21 November 2026. */
const END = Date.UTC(2026, 10, 21);
const STEP = (90 / 12) * 86_400_000;
const day = (i: number) => new Date(END - (12 - i) * STEP).toISOString().slice(0, 10);
const points = (values: number[]): TrendPoint[] =>
  values.map((value, i) => ({ at: day(i), value }));

const meta: Meta<typeof TrendChart> = {
  title: 'Molecules/TrendChart',
  component: TrendChart,
};

export default meta;

type Story = StoryObj<typeof TrendChart>;

export const Default: Story = {
  args: {
    title: 'Coverage over time',
    description: 'One point per measurement.',
    range: '90D',
    onRangeChange: () => {},
    series: [
      {
        dimension: 'code',
        name: 'Code',
        delta: 7,
        points: points([12, 12, 14, 14, 18, 20, 22, 22, 24, 26, 28, 30, 31]),
      },
      {
        dimension: 'visual',
        name: 'Visual',
        delta: 7,
        points: points([55, 57, 59, 61, 63, 65, 67, 67, 69, 71, 73, 73, 76]),
      },
      {
        dimension: 'acceptance',
        name: 'Acceptance',
        delta: 25,
        points: points([0, 0, 25, 25, 25, 25, 25, 25, 25, 25, 50, 50, 50]),
      },
      {
        dimension: 'health',
        name: 'Health',
        delta: 9,
        points: points([73, 73, 82, 82, 82, 82, 82, 91, 91, 91, 91, 91, 91]),
      },
    ],
  },
};
