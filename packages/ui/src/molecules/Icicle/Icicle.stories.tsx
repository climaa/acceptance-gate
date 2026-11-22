import type { Meta, StoryObj } from '@storybook/react';

import { Icicle, type IcicleNode, type IcicleTone } from './Icicle';

const meta: Meta<typeof Icicle> = {
  title: 'Molecules/Icicle',
  component: Icicle,
};

export default meta;

type Story = StoryObj<typeof Icicle>;

const leaves = (tone: IcicleTone, entries: [string, number, string?][]): IcicleNode[] =>
  entries.map(([label, weight, detail]) => ({ label, weight, detail, tone }));

const heat = (entries: [string, number, IcicleTone, string?][]): IcicleNode[] =>
  entries.map(([label, weight, tone, detail]) => ({ label, weight, tone, detail }));

/** The repository by lines: category, then workspace, each leaf by coverage state. */
const REPOSITORY: IcicleNode = {
  label: 'repository',
  detail: '48k lines · 2 of 11 workspaces measure',
  children: [
    {
      label: 'apps',
      detail: '29.6k lines',
      children: [
        {
          label: '@gate/visual-diff-ui',
          weight: 19230,
          tone: 'success',
          detail: '95.2% · floor 94',
        },
        { label: '@gate/blog', weight: 5885, tone: 'danger', detail: '98.1% reached' },
        ...leaves('danger', [
          ['@gate/e2e', 2040],
          ['@gate/manual', 1300],
          ['@gate/storybook', 1145],
        ]),
      ],
    },
    {
      label: 'scripts',
      detail: '10.4k lines',
      children: leaves('danger', [
        ['.sandcastle/', 5615, 'unmeasured'],
        ['scripts/', 4785, 'unmeasured'],
      ]),
    },
    {
      label: 'packages',
      detail: '8k lines',
      children: [
        {
          label: '@gate/visual-diff',
          weight: 4190,
          tone: 'danger',
          detail: '100% reached',
        },
        { label: '@gate/ui', weight: 3420, tone: 'success' },
        ...leaves('danger', [
          ['@gate/logger', 250],
          ['@gate/links', 140],
        ]),
      ],
    },
  ],
};

/** One workspace's files by lines, grouped by tier, each leaf by coverage state. */
const FILES: IcicleNode = {
  label: '@gate/ui',
  detail: '3.4k lines · 98.9% lines covered',
  children: [
    {
      label: 'organisms',
      detail: '1.6k lines',
      children: [
        { label: 'PanZoom', weight: 735, tone: 'success', detail: '96.9%' },
        { label: 'Dialog', weight: 255, tone: 'success', detail: '100%' },
        ...leaves('success', [
          ['geometry', 216],
          ['Table', 160],
          ['SiteHeader', 96],
          ['SiteFooter', 77],
          ['index', 35],
        ]),
      ],
    },
    {
      label: 'atoms',
      detail: '998 lines',
      children: leaves('success', [
        ['Thumbnail', 130],
        ['SegmentedControl', 98],
        ['TriStateCheckbox', 85],
        ['Button', 74],
        ['Meter', 72],
        ['ThemeToggle', 68],
        ['IconButton', 64],
        ['Skeleton', 58],
        ['Badge', 54],
        ['Text', 50],
        ['BucketChip', 46],
        ['EmptyState', 42],
        ['Link', 37],
        ['Spinner', 33],
        ['Stack', 28],
        ['Tag', 24],
        ['Prose', 20],
        ['SkipLink', 15],
      ]),
    },
    {
      label: 'molecules',
      detail: '582 lines',
      children: leaves('success', [
        ['Pagination', 191],
        ['PostCard', 106],
        ['Card', 84],
        ['PostMeta', 60],
        ['TagList', 52],
        ['CodeBlock', 45],
        ['StepList', 44],
      ]),
    },
    {
      label: 'templates',
      children: leaves('success', [
        ['PostTemplate', 90],
        ['BlogIndexTemplate', 60],
      ]),
    },
    {
      label: '(root)',
      children: [
        { label: 'tokens', weight: 55, tone: 'warning' },
        { label: 'index', weight: 41, tone: 'danger' },
      ],
    },
  ],
};

/** Cognitive complexity by workspace, then directory, each leaf by its density. */
const COMPLEXITY: IcicleNode = {
  label: 'repository',
  detail: '3,798 cognitive complexity',
  children: [
    {
      label: '@gate/visual-diff-ui',
      detail: '1272',
      children: heat([
        ['components', 571, 'heat-2', '571 · 0.07/line'],
        ['lib', 414, 'heat-2', '414 · 0.06/line'],
        ['hooks', 143, 'heat-3'],
        ['app', 70, 'heat-1'],
        ['screens', 37, 'heat-2'],
        ['styles', 37, 'heat-2'],
      ]),
    },
    {
      label: 'scripts/',
      detail: '750',
      children: heat([
        ['pen', 386, 'heat-4', '386 · 0.23/line'],
        ['(root)', 246, 'heat-3'],
        ['gate', 118, 'heat-2'],
      ]),
    },
    {
      label: '.sandcastle/',
      detail: '586',
      children: heat([['(root)', 586, 'heat-3', '586 · 0.11/line']]),
    },
    {
      label: '@gate/visual-diff',
      detail: '343',
      children: heat([['src', 343, 'heat-2', '343 · 0.08/line']]),
    },
    {
      label: '@gate/blog',
      detail: '297',
      children: heat([
        ['app', 100, 'heat-1'],
        ['lib', 82, 'heat-2'],
        ['components', 61, 'heat-3'],
        ['content', 18, 'heat-2'],
        ['scripts', 18, 'heat-2'],
        ['styles', 18, 'heat-2'],
      ]),
    },
    {
      label: '@gate/ui',
      children: heat([
        ['organisms', 143, 'heat-2'],
        ['atoms', 55, 'heat-2'],
        ['molecules', 48, 'heat-1'],
      ]),
    },
    {
      label: '@gate/storybook',
      children: heat([
        ['.storybook', 100, 'heat-2'],
        ['stories', 80, 'heat-1'],
      ]),
    },
    {
      label: '@gate/e2e',
      children: heat([
        ['steps', 36, 'heat-1'],
        ['support', 24, 'heat-2'],
      ]),
    },
    {
      label: '@gate/manual',
      children: heat([
        ['app', 22, 'heat-1'],
        ['lib', 12, 'heat-4'],
      ]),
    },
    { label: '@gate/logger', children: heat([['src', 18, 'heat-2']]) },
    { label: '@gate/links', children: heat([['src', 12, 'heat-1']]) },
  ],
};

export const Repository: Story = {
  args: { root: REPOSITORY, label: 'Coverage by workspace' },
};

export const Files: Story = {
  args: { root: FILES, label: 'Coverage by file' },
};

export const Complexity: Story = {
  args: { root: COMPLEXITY, label: 'Cognitive complexity by directory' },
};
