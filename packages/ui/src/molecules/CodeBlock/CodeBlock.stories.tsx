import type { Meta, StoryObj } from '@storybook/react';

import { CodeBlock } from './CodeBlock';

const meta: Meta<typeof CodeBlock> = {
  title: 'Molecules/CodeBlock',
  component: CodeBlock,
};

export default meta;

type Story = StoryObj<typeof CodeBlock>;

export const WithLanguage: Story = {
  args: {
    language: 'typescript',
    children: 'const x: number = 1;',
  },
};

export const WithoutLanguage: Story = {
  args: {
    children: 'echo "no language label here"',
  },
};

// Shows the block scrolls its own overflow rather than the page — the reason
// the component may not wrap, truncate or ellipsize what it is given.
export const LongLine: Story = {
  args: {
    language: 'bash',
    children:
      'pnpm --filter @gate/storybook build && pnpm --filter @gate/storybook exec storybook build --output-dir storybook-static --quiet --loglevel warn',
  },
};
