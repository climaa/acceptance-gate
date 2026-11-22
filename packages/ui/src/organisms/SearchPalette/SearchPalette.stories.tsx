import type { Meta, StoryObj } from '@storybook/react';

import type { SearchEntry } from './search';
import { SearchPalette } from './SearchPalette';

/**
 * `visual-diff:fullpage` for Dialog's reason: the palette is `position: fixed`
 * over the viewport and adds no height to `#storybook-root`, so only a
 * whole-page capture frames it. The mobile pair is the bottom sheet. The tag is a
 * literal because Storybook indexes CSF statically; SearchPalette.test.tsx holds
 * it equal to `FULLPAGE_TAG`.
 *
 * Frozen open with a typed query, so the capture is the results state the tile
 * draws, with no interaction behind it.
 */
const meta = {
  title: 'Organisms/SearchPalette',
  component: SearchPalette,
  tags: ['visual-diff:fullpage'],
  parameters: { docs: { story: { inline: false, iframeHeight: 480 } } },
  args: {
    open: true,
    onClose: () => {},
    onQueryChange: () => {},
    onSelect: () => {},
  },
} satisfies Meta<typeof SearchPalette>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Census's index, cut to the entries the tile shows plus some the query rules out. */
const INDEX: SearchEntry[] = [
  { id: 'workspace:packages/ui', kind: 'workspace', title: 'packages/ui' },
  {
    id: 'component:Table',
    kind: 'component',
    title: 'Table',
    meta: 'organisms · @gate/ui',
  },
  {
    id: 'component:Dialog',
    kind: 'component',
    title: 'Dialog',
    meta: 'organisms · @gate/ui',
  },
  {
    id: 'file:packages/ui/src/organisms/Table/Table.tsx',
    kind: 'file',
    title: 'packages/ui/src/organisms/Table/Table.tsx',
  },
  {
    id: 'file:packages/ui/src/organisms/Table/Table.css',
    kind: 'file',
    title: 'packages/ui/src/organisms/Table/Table.css',
  },
  {
    id: 'component-incomplete:packages/ui:organisms-table--default',
    kind: 'gap',
    title: 'Table',
    meta: 'component-incomplete',
  },
];

/** "table" typed: a component, its two files and its gap, the first result active. */
export const Results: Story = {
  args: { entries: INDEX, query: 'table' },
};
