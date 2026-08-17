import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BucketChip, type BucketChipTone } from './BucketChip';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(cleanup);

// Typed as the union rather than inferred, so removing a tone from BucketChipTone
// fails the typecheck here. Adding one is not caught — the new tone simply has no
// row until someone writes it.
const TONES: BucketChipTone[] = ['danger', 'accent', 'neutral', 'muted', 'a11y'];

const OTHER_TONES = TONES.filter((tone) => tone !== 'a11y');

describe('BucketChip', () => {
  it('renders a button whose accessible name is exactly the label', () => {
    // The count is beside the label inside the chip, so a name taken from the
    // chip's contents would read `changed 17`. Downstream filters query these
    // chips by exact name, which that spelling would never match.
    render(<BucketChip tone="danger" label="changed" count={17} />);

    expect(screen.getByRole('button', { name: 'changed' })).toBeDefined();
  });

  it('distinguishes `changed` from `unchanged` by exact name', () => {
    render(
      <>
        <BucketChip tone="danger" label="changed" count={17} />
        <BucketChip tone="muted" label="unchanged" count={89} />
      </>,
    );

    // `getByRole` throws on more than one match, so each of these asserts that
    // the substring relationship between the two labels does not leak.
    expect(screen.getByRole('button', { name: 'changed' }).textContent).toBe('changed17');
    expect(screen.getByRole('button', { name: 'unchanged' }).textContent).toBe(
      'unchanged89',
    );
  });

  it('renders the count in the element carrying the tabular-numerals treatment', () => {
    const { container } = render(<BucketChip tone="neutral" label="total" count={106} />);

    const count = container.querySelector('.ds-bucket-chip__count');

    expect(count?.textContent).toBe('106');
  });

  it('describes the button by its count, so the number is still announced', () => {
    const { container } = render(<BucketChip tone="neutral" label="total" count={106} />);

    const button = screen.getByRole('button', { name: 'total' });
    const count = container.querySelector('.ds-bucket-chip__count');

    expect(button.getAttribute('aria-describedby')).toBe(count?.id);
    // An empty id would make the reference dangle rather than resolve.
    expect(count?.id).toBeTruthy();
  });

  it.each(TONES)('maps the %s tone to its modifier class', (tone) => {
    render(<BucketChip tone={tone} label="changed" count={1} />);

    const chip = screen.getByRole('button', { name: 'changed' });

    // Exact, not `toContain`: an omitted `className` must be filtered out rather
    // than joined in as a trailing empty or `undefined` class.
    expect(chip.className).toBe(`ds-bucket-chip ds-bucket-chip--${tone}`);
  });

  // The exclusivity the tone exists for: an accessibility failure must not be
  // able to borrow the look of a pixel bucket, or vice versa.
  it.each(OTHER_TONES)('does not emit the a11y modifier class for %s', (tone) => {
    const { container } = render(<BucketChip tone={tone} label="changed" count={1} />);

    expect(container.querySelector('.ds-bucket-chip--a11y')).toBeNull();
  });

  it('reflects `pressed` into aria-pressed', () => {
    render(<BucketChip tone="danger" label="changed" count={1} pressed />);

    expect(
      screen.getByRole('button', { name: 'changed' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('emits aria-pressed="false" when explicitly unpressed', () => {
    render(<BucketChip tone="danger" label="changed" count={1} pressed={false} />);

    expect(
      screen.getByRole('button', { name: 'changed' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('emits no aria-pressed attribute when `pressed` is absent', () => {
    // A chip that is only a summary is not a toggle; `aria-pressed="false"` would
    // announce a filter that does not exist.
    render(<BucketChip tone="danger" label="changed" count={1} />);

    expect(
      screen.getByRole('button', { name: 'changed' }).hasAttribute('aria-pressed'),
    ).toBe(false);
  });

  it('is a type="button", so a chip inside a form submits nothing', () => {
    render(<BucketChip tone="danger" label="changed" count={1} />);

    expect(screen.getByRole('button', { name: 'changed' }).getAttribute('type')).toBe(
      'button',
    );
  });

  it('calls onClick when activated', () => {
    const onClick = vi.fn();
    render(<BucketChip tone="danger" label="changed" count={1} onClick={onClick} />);

    fireEvent.click(screen.getByRole('button', { name: 'changed' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('appends a caller-supplied className after the tone class', () => {
    render(<BucketChip tone="danger" label="changed" count={1} className="u-mt-2" />);

    expect(screen.getByRole('button', { name: 'changed' }).className).toBe(
      'ds-bucket-chip ds-bucket-chip--danger u-mt-2',
    );
  });
});
