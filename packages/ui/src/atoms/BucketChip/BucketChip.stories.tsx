import type { Meta, StoryObj } from '@storybook/react';

import { Stack } from '../Stack/Stack';
import { BucketChip } from './BucketChip';

const meta: Meta<typeof BucketChip> = {
  title: 'Atoms/BucketChip',
  component: BucketChip,
};

export default meta;

type Story = StoryObj<typeof BucketChip>;

/**
 * Every tone in one shot, labelled with the buckets a report would map onto them
 * — that mapping lives in the consumer, never here. The last chip is pressed, so
 * the filter state is captured alongside the tones.
 */
export const Tones: Story = {
  render: () => (
    <Stack direction="row" gap={2} align="center" wrap>
      <BucketChip tone="danger" label="changed" count={17} />
      <BucketChip tone="accent" label="added" count={4} />
      <BucketChip tone="neutral" label="removed" count={2} />
      <BucketChip tone="muted" label="unchanged" count={83} />
      <BucketChip tone="a11y" label="a11y" count={1} pressed />
    </Stack>
  ),
};
