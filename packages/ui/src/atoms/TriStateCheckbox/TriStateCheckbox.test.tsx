import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TriStateCheckbox } from './TriStateCheckbox';

// `globals` is off in vitest.config.ts, so Testing Library never sees a global
// `afterEach` to hook its automatic cleanup onto — without this every render
// stacks in the same document and `getByRole` matches the previous test's DOM.
afterEach(cleanup);

/**
 * Two rules are switched off for a component-level run, and only two:
 * `color-contrast` needs a canvas jsdom does not implement (axe reports it as
 * incomplete rather than passing, which is not the same as clean), and `region`
 * asks a *page* whether its content sits in a landmark — an atom rendered on its
 * own can never satisfy it, and the consumer owns that answer.
 */
const expectNoAxeViolations = async (container: HTMLElement) => {
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });

  expect(results.violations.map((violation) => violation.id)).toEqual([]);
};

// The props every test starts from; each spreads them and overrides only what it
// is about. `onChange` is a filler — the tests that assert on the callback pass
// their own mock, so nothing accumulates calls across the file.
const baseProps = {
  checked: false,
  label: 'Select all',
  onChange: () => {},
};

const box = () => screen.getByRole<HTMLInputElement>('checkbox');

describe('TriStateCheckbox', () => {
  it('is findable by its label as the accessible name', () => {
    render(<TriStateCheckbox {...baseProps} label="Select all variants" />);

    screen.getByRole('checkbox', { name: 'Select all variants' });
  });

  it('exposes aria-checked="mixed" and the DOM indeterminate property when indeterminate', () => {
    render(<TriStateCheckbox {...baseProps} indeterminate />);

    // `indeterminate` is a DOM property with no attribute form, so a test that
    // only read markup would pass against a control that never went mixed.
    expect(box().indeterminate).toBe(true);
    expect(box().getAttribute('aria-checked')).toBe('mixed');
  });

  it('drops the mixed state when checked and not indeterminate', () => {
    render(<TriStateCheckbox {...baseProps} checked />);

    expect(box().indeterminate).toBe(false);
    expect(box().getAttribute('aria-checked')).toBeNull();
    expect(box().checked).toBe(true);
  });

  it('clears the DOM property when indeterminate goes back to false', () => {
    const { rerender } = render(<TriStateCheckbox {...baseProps} indeterminate />);

    rerender(<TriStateCheckbox {...baseProps} checked />);

    // The ref effect writes the property; a re-render alone does not undo it,
    // which is exactly the bug an effect keyed on the prop has to prevent.
    expect(box().indeterminate).toBe(false);
  });

  it('reports the next checked state to onChange when toggled', () => {
    const onChange = vi.fn();
    render(<TriStateCheckbox {...baseProps} onChange={onChange} />);

    fireEvent.click(box());

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('reports false when toggled off', () => {
    const onChange = vi.fn();
    render(<TriStateCheckbox {...baseProps} checked onChange={onChange} />);

    fireEvent.click(box());

    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('moves from mixed to checked when a controlled parent handles the toggle', () => {
    function Host() {
      const [checked, setChecked] = useState(false);
      const [mixed, setMixed] = useState(true);

      return (
        <TriStateCheckbox
          {...baseProps}
          checked={checked}
          indeterminate={mixed}
          onChange={(next) => {
            setChecked(next);
            setMixed(false);
          }}
        />
      );
    }

    render(<Host />);
    fireEvent.click(box());

    expect(box().indeterminate).toBe(false);
    expect(box().checked).toBe(true);
    expect(box().getAttribute('aria-checked')).toBeNull();
  });

  it('carries only the block class when no className is supplied', () => {
    const { container } = render(<TriStateCheckbox {...baseProps} />);

    // Exact, not `toContain`: an omitted `className` must be filtered out
    // rather than joined in as a trailing empty or `undefined` class.
    expect(container.firstElementChild?.className).toBe('ds-tristate-checkbox');
  });

  it('appends a caller-supplied className', () => {
    const { container } = render(
      <TriStateCheckbox {...baseProps} className="u-ml-auto" />,
    );

    expect(container.firstElementChild?.className).toBe('ds-tristate-checkbox u-ml-auto');
  });

  it('passes axe in the mixed state', async () => {
    const { container } = render(<TriStateCheckbox {...baseProps} indeterminate />);

    await expectNoAxeViolations(container);
  });

  it('passes axe in the checked state', async () => {
    const { container } = render(<TriStateCheckbox {...baseProps} checked />);

    await expectNoAxeViolations(container);
  });
});
