import type { Meta, StoryObj } from '@storybook/react';

import { Stack } from '../Stack/Stack';
import { Thumbnail } from './Thumbnail';

const meta: Meta<typeof Thumbnail> = {
  title: 'Atoms/Thumbnail',
  component: Thumbnail,
};

export default meta;

type Story = StoryObj<typeof Thumbnail>;

/**
 * An inline SVG, not a file and not a network fetch: a capture that waits on a
 * request is one that can time out differently on two machines. The shapes stand
 * in for a screenshot — a fixture, not a swatch, so the literals in it are
 * content rather than styling.
 */
const SHOT =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='100'%3E%3Crect width='160' height='100' fill='%23efe9df'/%3E%3Crect x='16' y='20' width='128' height='12' rx='3' fill='%23713520'/%3E%3Crect x='16' y='44' width='96' height='10' rx='3' fill='%23b9ada0'/%3E%3Crect x='16' y='66' width='112' height='10' rx='3' fill='%23b9ada0'/%3E%3C/svg%3E";

/**
 * The two states a reader meets in a report: a side that has a capture, and a
 * side that never had one. Both frames are given the same width by the story, so
 * the pair reads as two sides of one comparison; the fallback's copy comes from
 * the consumer, which is why the atom has none of its own.
 */
export const LoadedAndFallback: Story = {
  render: () => (
    <Stack direction="row" gap={4} align="start">
      <div style={{ width: '10rem' }}>
        <Thumbnail src={SHOT} alt="Baseline capture of the report header" />
      </div>
      <div style={{ width: '10rem' }}>
        <Thumbnail alt="Candidate capture" fallback={<>not on this side</>} />
      </div>
    </Stack>
  ),
};
