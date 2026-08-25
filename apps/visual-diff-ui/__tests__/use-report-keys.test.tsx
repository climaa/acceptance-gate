// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReportKeys } from '../hooks/useReportKeys';
import { type ReportCard, cardElementId } from '../lib/report-view';

/**
 * The review loop's keyboard, on its own.
 *
 * The hook was reached only through `ReportTemplate`, where `j`/`k` and `space`
 * are exercised by the cases that care about what the report looks like
 * afterwards. `n`, `b` and the guards — a key typed into a field, a key pressed
 * while the modal owns the keyboard, a key this hook does not bind — were reached
 * by nothing, and a walk that stops working reads there as a report that did not
 * scroll.
 *
 * The cursor is the document's own focus rather than React state, so these cases
 * move focus and assert on `document.activeElement`, which is what the hook reads.
 */

afterEach(cleanup);

const card = (key: string, bucket: ReportCard['bucket'] = 'changed'): ReportCard => ({
  key,
  storyId: `atoms-${key}--default`,
  title: `Atoms/${key}`,
  tier: 'atoms',
  bucket,
  worst: 0,
  variants: [],
  viewportsShown: [],
});

const CARDS = [card('a'), card('b'), card('c')];

/** The markup the hook walks, and the contract it depends on: `focusedIndex` reads
 *  the card's KEY out of `data-report-card`, so a bare attribute leaves every card
 *  unfindable, and `focusCard` finds the element by `cardElementId(key)`. Both are
 *  properties of the markup rather than of this hook — which is why a card rendered
 *  the wrong way fails here rather than three components downstream. */
function Harness({
  cards = CARDS,
  reviewed = new Set<string>(),
  enabled = true,
  onToggle = vi.fn(),
  onCompare = vi.fn(),
}: {
  cards?: readonly ReportCard[];
  reviewed?: Set<string>;
  enabled?: boolean;
  onToggle?: (card: ReportCard, next: boolean) => void;
  onCompare?: (card: ReportCard) => void;
}) {
  useReportKeys({
    cards,
    isReviewed: (c) => reviewed.has(c.key),
    onToggle,
    onCompare,
    enabled,
  });

  return (
    <div>
      {cards.map((c) => (
        <article
          key={c.key}
          id={cardElementId(c.key)}
          data-report-card={c.key}
          tabIndex={-1}
        >
          {c.title}
        </article>
      ))}
      <input aria-label="filter" />
    </div>
  );
}

const focus = (key: string) => document.getElementById(cardElementId(key))?.focus();
const focused = () => document.activeElement?.id;

const press = (key: string, target: Element | Document = document) =>
  fireEvent.keyDown(target, { key });

describe('walking the cards', () => {
  it('moves to the next card on j and the previous on k', () => {
    render(<Harness />);
    focus('a');

    press('j');
    expect(focused()).toBe(cardElementId('b'));

    press('k');
    expect(focused()).toBe(cardElementId('a'));
  });

  /** Clamped, not wrapped — unlike the mode tabs. A report is a list a reviewer
   *  works down, and wrapping past the end would silently start it again. */
  it('stops at both ends rather than wrapping', () => {
    render(<Harness />);

    focus('c');
    press('j');
    expect(focused()).toBe(cardElementId('c'));

    focus('a');
    press('k');
    expect(focused()).toBe(cardElementId('a'));
  });
});

describe('n — the next card nobody has looked at', () => {
  it('skips the ones already reviewed', () => {
    render(<Harness reviewed={new Set(['b'])} />);
    focus('a');

    press('n');

    expect(focused()).toBe(cardElementId('c'));
  });

  /** From the last unreviewed card it comes round, because "next unreviewed" is a
   *  question about the whole report rather than about what is below the cursor. */
  it('wraps round the report', () => {
    render(<Harness reviewed={new Set(['b', 'c'])} />);
    focus('b');

    press('n');

    expect(focused()).toBe(cardElementId('a'));
  });

  it('leaves the cursor alone when everything is reviewed', () => {
    render(<Harness reviewed={new Set(['a', 'b', 'c'])} />);
    focus('b');

    press('n');

    expect(focused()).toBe(cardElementId('b'));
  });
});

describe('b — the comparison', () => {
  it('opens the card under the cursor', () => {
    const onCompare = vi.fn();
    render(<Harness onCompare={onCompare} />);
    focus('b');

    press('b');

    expect(onCompare).toHaveBeenCalledWith(expect.objectContaining({ key: 'b' }));
  });

  /** With no card under the cursor there is nothing to compare, and the key
   *  reaches whatever is next exactly as an unbound one does. */
  it('does nothing with the cursor outside every card', () => {
    const onCompare = vi.fn();
    render(<Harness onCompare={onCompare} />);

    press('b');

    expect(onCompare).not.toHaveBeenCalled();
  });
});

describe('the keys this hook must not take', () => {
  it('leaves a key typed into a field to the field', () => {
    const onCompare = vi.fn();
    const { container } = render(<Harness onCompare={onCompare} />);
    focus('b');
    const field = container.querySelector('input');

    press('b', field as Element);
    press('j', field as Element);

    expect(onCompare).not.toHaveBeenCalled();
    expect(focused()).toBe(cardElementId('b'));
  });

  /** While the comparison modal is open the dialog owns the keyboard: a `j` that
   *  moved focus to a card behind it would take the reviewer out of a surface
   *  they never left. */
  it('is inert while the modal has the keyboard', () => {
    render(<Harness enabled={false} />);
    focus('a');

    press('j');

    expect(focused()).toBe(cardElementId('a'));
  });

  it('ignores a key it does not bind', () => {
    const onToggle = vi.fn();
    render(<Harness onToggle={onToggle} />);
    focus('a');

    press('q');
    press('Enter');

    expect(onToggle).not.toHaveBeenCalled();
    expect(focused()).toBe(cardElementId('a'));
  });
});
