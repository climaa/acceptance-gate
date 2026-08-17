import type { Meta, StoryObj } from '@storybook/react';

import { Table } from './Table';

const meta = {
  title: 'Organisms/Table',
  component: Table,
} satisfies Meta<typeof Table>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Every value below is a frozen literal — no clock, no counter, no id generated at
 * render time. Organisms are captured at desktop *and* mobile, so each of these
 * stories is four baselines, and anything that changes between two runs changes
 * all four of them for no reason anyone could read off the diff.
 */
export const Default: Story = {
  args: {
    label: 'Snapshot sets',
    columns: [{ header: 'Set' }, { header: 'Branch' }, { header: 'Captured' }],
    rows: [
      { key: 'main-2026-08-13', cells: ['main-2026-08-13', 'main', '13 Aug 2026'] },
      { key: 'wave-5-organisms', cells: ['wave-5-organisms', 'wave-5', '17 Aug 2026'] },
      {
        key: 'owl-selector-fix',
        cells: ['owl-selector-fix', 'prose-rhythm', '13 Aug 2026'],
      },
    ],
  },
};

/**
 * The two column kinds side by side. The story ids are long enough to ellipsize at
 * both captured widths, which is what makes this story the truncation baseline;
 * the object cell form puts each one back on `title`, so the value the ellipsis
 * hides is still reachable.
 */
export const NumericAndTruncating: Story = {
  args: {
    label: 'Past runs',
    columns: [
      { header: 'Story', truncate: true },
      { header: 'Stories', numeric: true },
      { header: 'Exit', numeric: true },
      { header: 'Duration', numeric: true },
    ],
    rows: [
      {
        key: 'organisms-site-header',
        cells: [
          {
            content: 'organisms-site-header--default-desktop-dark',
            title: 'organisms-site-header--default-desktop-dark',
          },
          106,
          0,
          '48.2s',
        ],
      },
      {
        key: 'templates-post-template',
        cells: [
          {
            content: 'templates-post-template--with-long-title-mobile-light',
            title: 'templates-post-template--with-long-title-mobile-light',
          },
          98,
          1,
          '51.7s',
        ],
      },
      {
        key: 'molecules-code-block',
        cells: [
          {
            content: 'molecules-code-block--typescript-desktop-light',
            title: 'molecules-code-block--typescript-desktop-light',
          },
          12,
          0,
          '9.4s',
        ],
      },
    ],
  },
};
