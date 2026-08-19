import type { Meta, StoryObj } from '@storybook/react';

import { CodeBlock } from './CodeBlock';

const meta: Meta<typeof CodeBlock> = {
  title: 'Molecules/CodeBlock',
  component: CodeBlock,
  // `overflow-x: auto`, and `LongLine` exists to prove the block scrolls its own
  // overflow rather than the page. Below the breakpoint is where that claim is
  // load-bearing and where it was never photographed. Tagged on the meta rather
  // than on `LongLine` alone: Storybook merges meta tags into every story, and
  // the two short stories are what say the mobile box is right when nothing
  // overflows. See the note on SegmentedControl for why the tag is a literal.
  tags: ['visual-diff:all-viewports'],
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
