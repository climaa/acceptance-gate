// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReviewMarks } from '../hooks/useReviewMarks';
import { reviewStorageKey } from '../lib/review-state';

/**
 * The marks a reviewer has made, as the two screens that read them see it.
 *
 * The report owns the marking; the console's accept gate only counts. They are
 * separate routes, so a reviewer can have both open — and until this hook
 * listened for `storage` the gate went on counting the number it read when it
 * mounted. It looked fresh only because `RunPanel` used to call `readReviewed`
 * during render and re-rendered once a second, which is the defect that made
 * this hook the gate's reader in the first place.
 */

const REPORT = 'main-2026-08-17__main-2026-08-13';

/** Reads the hook and draws what it holds, so a case asserts on rendered output
 *  rather than on a hook harness's internals. */
function Marks({ reportId = REPORT }: { reportId?: string }) {
  const { marks, mark } = useReviewMarks(reportId);

  return (
    <div>
      <span data-testid="count">{marks.size}</span>
      <button type="button" onClick={() => mark(['a__b__c__d'], true)}>
        mark one
      </button>
    </div>
  );
}

const count = () => screen.getByTestId('count').textContent;

/** Reports each render through a prop rather than by reassigning a variable in
 *  scope — `react-hooks/globals` rejects the latter as an impure render, which
 *  is exactly what it would be. */
function Counting({ onRender }: { onRender: () => void }) {
  useReviewMarks(REPORT);
  onRender();

  return null;
}

/** What another tab's write looks like from in here: localStorage already holds
 *  the new value, and the event says which key moved. jsdom dispatches nothing
 *  on `setItem`, and a real browser does not fire `storage` in the writing
 *  document either — so both halves are driven by hand, which is also what the
 *  production path does. */
function writeFromAnotherTab(keys: string[], reportId = REPORT) {
  const key = reviewStorageKey(reportId);
  localStorage.setItem(key, JSON.stringify(keys));
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key }));
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('useReviewMarks', () => {
  it('starts from what this browser already holds', () => {
    localStorage.setItem(reviewStorageKey(REPORT), JSON.stringify(['a', 'b']));

    render(<Marks />);

    expect(count()).toBe('2');
  });

  it('picks up marks made in another tab', () => {
    render(<Marks />);
    expect(count()).toBe('0');

    writeFromAnotherTab(['a', 'b', 'c']);

    expect(count()).toBe('3');
  });

  it('picks up the whole store being cleared', () => {
    localStorage.setItem(reviewStorageKey(REPORT), JSON.stringify(['a', 'b']));
    render(<Marks />);
    expect(count()).toBe('2');

    localStorage.clear();
    // `key: null` is what a browser sends for `localStorage.clear()`, and this
    // report's marks went with it.
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
    });

    expect(count()).toBe('0');
  });

  // Every report keeps its own marks under its own key, so a write against
  // another report is not this store's business.
  //
  // Asserted as a read that does not happen, because that is the only place it
  // shows: the value under OUR key has not moved either way, so the equality
  // guard below would swallow the difference and a rendered-output assertion
  // would pass with the filter deleted. What the filter saves is the re-read —
  // a `getItem` plus a `JSON.parse` per unrelated write, on a listener bound for
  // as long as the console is open.
  it('does not even re-read for a write against a different report', () => {
    localStorage.setItem(reviewStorageKey(REPORT), JSON.stringify(['a']));
    render(<Marks />);

    const ours = reviewStorageKey(REPORT);
    const original = Storage.prototype.getItem;
    let reads = 0;
    Storage.prototype.getItem = function patched(key: string) {
      if (key === ours) reads += 1;

      return original.call(this, key);
    };

    try {
      writeFromAnotherTab(['x', 'y', 'z'], 'some-other-report');

      expect(reads).toBe(0);
      expect(count()).toBe('1');
    } finally {
      Storage.prototype.getItem = original;
    }
  });

  // The listener re-reads storage, so an event carrying no change would hand
  // `useSyncExternalStore` an equal-but-new Set and re-render every consumer for
  // nothing. The store keeps the object it already had.
  //
  // Counted rather than compared by DOM node: React reuses the node across a
  // re-render, so `getByTestId` returns the same element either way and an
  // identity assertion here would pass with the guard deleted.
  it('does not disturb its consumers when the marks did not move', () => {
    localStorage.setItem(reviewStorageKey(REPORT), JSON.stringify(['a', 'b']));
    const onRender = vi.fn();

    render(<Counting onRender={onRender} />);
    const settled = onRender.mock.calls.length;

    // The same two keys, in the other order — a different array, the same marks.
    writeFromAnotherTab(['b', 'a']);

    expect(onRender).toHaveBeenCalledTimes(settled);
  });

  // A mark made HERE is the store's own write. The browser fires no `storage`
  // event in the writing document, so this path is the local one and has to
  // stand on its own.
  it('shows a mark made in this tab', () => {
    render(<Marks />);

    act(() => {
      screen.getByRole('button', { name: 'mark one' }).click();
    });

    expect(count()).toBe('1');
    expect(localStorage.getItem(reviewStorageKey(REPORT))).toBe(
      JSON.stringify(['a__b__c__d']),
    );
  });
});
