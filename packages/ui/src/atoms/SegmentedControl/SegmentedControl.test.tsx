import { ALL_VIEWPORTS_TAG } from '@gate/visual-diff/policy';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SegmentedControl } from './SegmentedControl';
import meta from './SegmentedControl.stories';

// `globals` is off in vitest.config.ts, so Testing Library never sees a global
// `afterEach` to hook its automatic cleanup onto — without this every render
// stacks in the same document and `getByRole` matches the previous test's DOM.
afterEach(cleanup);

/** See TriStateCheckbox.test.tsx for why exactly these two rules are off. */
const expectNoAxeViolations = async (container: HTMLElement) => {
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });

  expect(results.violations.map((violation) => violation.id)).toEqual([]);
};

const MODES = [
  { value: 'side-by-side', label: 'Side by side' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'diff', label: 'Diff' },
] as const;

// The props every test starts from; each spreads them and overrides only what it
// is about. `onChange` is a filler — the tests that assert on the callback pass
// their own mock, so nothing accumulates calls across the file.
const baseProps = {
  label: 'Comparison mode',
  options: MODES,
  value: 'overlay',
  onChange: () => {},
};

const group = () => screen.getByRole('group', { name: 'Comparison mode' });

/** Every segment's `aria-pressed`, in DOM order. */
const pressedStates = (container: HTMLElement) =>
  [...container.querySelectorAll('button')].map((button) =>
    button.getAttribute('aria-pressed'),
  );

describe('SegmentedControl', () => {
  it('names the container group with its label', () => {
    render(<SegmentedControl {...baseProps} />);

    group();
  });

  it('takes toolbar as the container role when asked', () => {
    render(<SegmentedControl {...baseProps} role="toolbar" />);

    screen.getByRole('toolbar', { name: 'Comparison mode' });
  });

  it('gives every segment its option label, exactly, as the accessible name', () => {
    render(<SegmentedControl {...baseProps} />);

    // The downstream e2e contract is `{ name, exact: true }`; a string `name`
    // here is already exact-matched by Testing Library, and the textContent
    // assertion is what pins the other half of it — no counts, no icon text, no
    // extra nodes may leak into a segment's name.
    for (const mode of MODES) {
      const segment = within(group()).getByRole('button', { name: mode.label });

      expect(segment.textContent).toBe(mode.label);
    }
  });

  it('presses exactly one segment, the one matching value', () => {
    const { container } = render(<SegmentedControl {...baseProps} />);

    expect(pressedStates(container)).toEqual(['false', 'true', 'false']);
  });

  it('reports the clicked segment’s value to onChange', () => {
    const onChange = vi.fn();
    render(<SegmentedControl {...baseProps} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Diff' }));

    expect(onChange).toHaveBeenCalledWith('diff');
  });

  it('moves the pressed segment when a controlled parent adopts the change', () => {
    function Host() {
      const [value, setValue] = useState<string>('overlay');

      return <SegmentedControl {...baseProps} value={value} onChange={setValue} />;
    }

    const { container } = render(<Host />);

    fireEvent.click(screen.getByRole('button', { name: 'Diff' }));

    // Asserted over all three: the previously active segment has to flip to
    // "false", not merely lose a class while two report pressed.
    expect(pressedStates(container)).toEqual(['false', 'false', 'true']);
  });

  it('presses nothing when value matches no option', () => {
    const { container } = render(<SegmentedControl {...baseProps} value="a11y" />);

    expect(pressedStates(container)).toEqual(['false', 'false', 'false']);
  });

  it('keeps every segment tabbable and out of form submission', () => {
    const { container } = render(<SegmentedControl {...baseProps} />);

    for (const button of container.querySelectorAll('button')) {
      // No roving tabindex: this is a button group, and Space/Enter come free
      // from the native button on each of them.
      expect(button.hasAttribute('tabindex')).toBe(false);
      expect(button.getAttribute('type')).toBe('button');
    }
  });

  it('is a button group, never a radio group', () => {
    render(<SegmentedControl {...baseProps} />);

    // The comparison-modal e2e contract pins button + aria-pressed on both form
    // factors; radios would make every mode scenario unfindable.
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('carries only the block class when no className is supplied', () => {
    const { container } = render(<SegmentedControl {...baseProps} />);

    expect(container.firstElementChild?.className).toBe('ds-segmented');
  });

  it('appends a caller-supplied className', () => {
    const { container } = render(
      <SegmentedControl {...baseProps} className="u-ml-auto" />,
    );

    expect(container.firstElementChild?.className).toBe('ds-segmented u-ml-auto');
  });

  it('renders nothing but the container when given no options', () => {
    const { container } = render(
      <SegmentedControl {...baseProps} options={[]} value="" />,
    );

    expect(container.querySelectorAll('button')).toHaveLength(0);
    group();
  });

  it('passes axe as a group', async () => {
    const { container } = render(<SegmentedControl {...baseProps} />);

    await expectNoAxeViolations(container);
  });

  it('passes axe as a toolbar', async () => {
    const { container } = render(<SegmentedControl {...baseProps} role="toolbar" />);

    await expectNoAxeViolations(container);
  });
});

/**
 * The capture contract, the mirror of the `visual-diff:skip` blocks on
 * SkipLink and TagList: this component reflows with width, so its stories are
 * captured at every viewport rather than at the one its tier promises.
 *
 * Asserted on the meta, not on a story. Storybook merges a meta's tags into
 * every story it holds, which is the point — every story of this atom has a mobile branch to photograph, the wrap and the
 * thumb-target floor both being below the breakpoint.
 *
 * Equality against the imported constant, because the story file must write the
 * literal (CSF is indexed statically and rejects a non-literal tag), and a
 * literal is exactly what goes stale. `src/__tests__/viewport-contract.test.ts`
 * is the other half: it is what notices a component that grows a breakpoint and
 * never gets a tag at all.
 */
describe('the capture contract', () => {
  it('is captured at every viewport, with the string policy.mjs declares', () => {
    expect(meta.tags).toEqual([ALL_VIEWPORTS_TAG]);
  });
});
