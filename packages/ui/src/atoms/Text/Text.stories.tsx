import type { Meta, StoryObj } from '@storybook/react';

import { Stack } from '../Stack/Stack';
import { Text, TEXT_VARIANTS } from './Text';

const meta: Meta<typeof Text> = {
  title: 'Atoms/Text',
  component: Text,
};

export default meta;

type Story = StoryObj<typeof Text>;

// The board's own specimen line, so this capture and board 00's "Drawing Prose
// typeset" can be read side by side.
const SAMPLE = 'The gate blocks what the eye would miss.';

// One story for the whole scale, as Prose has one for its whole stylesheet: a
// role is only legible against its neighbours, and every role is one
// baseline pair rather than nine.
export const Roles: Story = {
  render: () => (
    <Stack gap={4}>
      {TEXT_VARIANTS.map((variant) => (
        <div key={variant}>
          <Text variant="label" as="p">
            {variant}
          </Text>
          <Text variant={variant}>{SAMPLE}</Text>
        </div>
      ))}
    </Stack>
  ),
};
