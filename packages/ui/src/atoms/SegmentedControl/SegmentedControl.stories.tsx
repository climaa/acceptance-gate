import type { Meta, StoryObj } from '@storybook/react';

import { SegmentedControl } from './SegmentedControl';

const meta: Meta<typeof SegmentedControl> = {
  title: 'Atoms/SegmentedControl',
  component: SegmentedControl,
  // `TIER_VIEWPORTS.atoms` is `['desktop']`, on the premise its own docstring
  // states outright: atoms "do not change shape between viewports, so capturing
  // them at mobile would double the baseline count and catch nothing". This atom
  // is the counter-example. It wraps (`flex-wrap: wrap`) and it raises its thumb
  // target under a `min-width: 768px` query, so it has a mobile branch that no
  // baseline in the corpus had ever rendered.
  //
  // That is not hypothetical: #306 shipped a WCAG 1.4.10 overflow here — five
  // segments 80px past a 320px viewport — and its own commit message says why
  // nothing caught it. "No baseline in the corpus renders this atom at a width
  // where it overflowed." It was found by a human measuring in Chromium.
  //
  // The literal is spelled out because CSF is indexed statically and rejects a
  // non-literal tag. `SegmentedControl.test.tsx` checks it against
  // `ALL_VIEWPORTS_TAG`; `src/__tests__/viewport-contract.test.ts` is what
  // notices the next atom to grow a breakpoint without one.
  tags: ['visual-diff:all-viewports'],
};

export default meta;

type Story = StoryObj<typeof SegmentedControl>;

/** Fixed options, a fixed selection and a no-op handler: the capture has to
 *  land on the same pixels every run, and the middle segment is the one that
 *  shows both a left and a right neighbour of the pressed state. */
export const Default: Story = {
  args: {
    label: 'Comparison mode',
    options: [
      { value: 'side-by-side', label: 'Side by side' },
      { value: 'overlay', label: 'Overlay' },
      { value: 'diff', label: 'Diff' },
    ],
    value: 'overlay',
    onChange: () => {},
  },
};

/**
 * Five segments, at the widths a phone actually has.
 *
 * `Default`'s three fit one row on a 320px viewport, so its mobile baselines
 * photograph the thumb-target floor and nothing else. Five is what
 * `apps/visual-diff-ui` passes below the breakpoint — `modesFor(false)` gives
 * baseline, candidate, diff, blink and slider — and five is the case #306
 * measured: the strip wanted 368px in a 288px content box and ran 80px past the
 * edge, a WCAG 2.1 AA 1.4.10 failure that `.ds-dialog__content`'s `overflow-y`
 * turned into a sideways scroll nobody would find.
 *
 * Tagging the module was not enough to catch that on its own, because no story
 * in the corpus rendered enough segments to overflow anything. This is the one
 * that does, and it is why `flex-wrap: wrap` now has a baseline holding it down
 * rather than a comment asking to be believed.
 */
export const Wrapping: Story = {
  args: {
    label: 'Comparison mode',
    options: [
      { value: 'baseline', label: 'Baseline' },
      { value: 'candidate', label: 'Candidate' },
      { value: 'diff', label: 'Diff' },
      { value: 'blink', label: 'Blink' },
      { value: 'slider', label: 'Slider' },
    ],
    value: 'diff',
    onChange: () => {},
  },
};
