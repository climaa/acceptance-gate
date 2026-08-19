// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FilterPicker } from '../components/FilterPicker';

/**
 * The control that replaced `--filter`.
 *
 * The old field accepted any substring and told a reviewer nothing about which
 * ones meant something. What is asserted here is the group arithmetic — a tier
 * speaks for the components under it, none/some/all — and the two sentences that
 * say what an empty selection does, because "nothing ticked" and "capture
 * nothing" are the reading this control has to rule out.
 */

const CORPUS = [
  {
    tier: 'atoms',
    components: [
      { filter: 'atoms-button', name: 'Button' },
      { filter: 'atoms-badge', name: 'Badge' },
    ],
  },
  { tier: 'molecules', components: [{ filter: 'molecules-card', name: 'Card' }] },
];

function renderPicker(value: string[] = []) {
  const onChange = vi.fn();
  render(
    <FilterPicker tiers={CORPUS} value={value} onChange={onChange} disabled={false} />,
  );

  return onChange;
}

/** The disclosure beside a tier's box, found by the count it shows. */
const expand = (count: number) =>
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`${count}$`) }));

const box = (name: string) => screen.getByRole<HTMLInputElement>('checkbox', { name });

afterEach(cleanup);

describe('the tiers', () => {
  it('offers every tier the build holds', () => {
    renderPicker();

    expect(box('atoms')).toBeDefined();
    expect(box('molecules')).toBeDefined();
  });

  // Collapsed to start: the real corpus is twenty-four components, which is a
  // list longer than the panel it sits in, and the tier is the first choice.
  it('hides the components until the tier is opened', () => {
    renderPicker();

    expect(screen.queryByRole('checkbox', { name: 'Button' })).toBeNull();

    expand(2);

    expect(box('Button')).toBeDefined();
  });

  it('ticks every component under a tier at once', () => {
    const onChange = renderPicker();

    fireEvent.click(box('atoms'));

    expect(onChange).toHaveBeenCalledWith(['atoms-button', 'atoms-badge']);
  });

  // Unticking a tier clears only its own components — a tier is never a switch
  // that also silences the tier beside it.
  it('clears only its own components', () => {
    const onChange = renderPicker(['atoms-button', 'atoms-badge', 'molecules-card']);

    fireEvent.click(box('atoms'));

    expect(onChange).toHaveBeenCalledWith(['molecules-card']);
  });

  it('reads as mixed when some of a tier is ticked', () => {
    renderPicker(['atoms-button']);

    expect(box('atoms').getAttribute('aria-checked')).toBe('mixed');
    // No `aria-checked` on the settled states: the atom states it for `mixed`
    // alone and leaves the native checkbox to report the other two, so these
    // assert the properties rather than an attribute meant to be absent. Both
    // properties, not just `checked`: with the attribute gone, `checked` alone no
    // longer says a box is *not* also mixed, and `indeterminate` is the half of
    // the arithmetic this suite exists to pin.
    expect(box('molecules').checked).toBe(false);
    expect(box('molecules').indeterminate).toBe(false);
  });

  it('reads as checked when all of a tier is ticked', () => {
    renderPicker(['atoms-button', 'atoms-badge']);

    expect(box('atoms').checked).toBe(true);
    expect(box('atoms').indeterminate).toBe(false);
  });
});

describe('one component', () => {
  it('adds the filter it names', () => {
    const onChange = renderPicker();
    expand(2);

    fireEvent.click(box('Button'));

    expect(onChange).toHaveBeenCalledWith(['atoms-button']);
  });

  it('removes it again without touching the rest', () => {
    const onChange = renderPicker(['atoms-button', 'molecules-card']);
    expand(2);

    fireEvent.click(box('Button'));

    expect(onChange).toHaveBeenCalledWith(['molecules-card']);
  });
});

describe('what the selection means', () => {
  // The reading this control exists to rule out: an empty set of checkboxes could
  // as easily mean "capture nothing", and the differ reads it as everything.
  it('says nothing ticked is the whole corpus', () => {
    renderPicker();

    expect(screen.getByRole('note', { name: 'filter scope' }).textContent).toMatch(
      /whole corpus/,
    );
  });

  it('counts what is ticked', () => {
    renderPicker(['atoms-button', 'molecules-card']);

    expect(screen.getByRole('note', { name: 'filter scope' }).textContent).toMatch(
      /^2 component/,
    );
  });

  // A checkout nobody has captured from yet. Not a refusal — the capture builds a
  // Storybook on its way past — so it says what will happen instead.
  it('says what a run does when there is no build to read', () => {
    render(<FilterPicker tiers={[]} value={[]} onChange={vi.fn()} disabled={false} />);

    expect(screen.getByRole('note', { name: 'no corpus yet' }).textContent).toMatch(
      /whole corpus/,
    );
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });
});
