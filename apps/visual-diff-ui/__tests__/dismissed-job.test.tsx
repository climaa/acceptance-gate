// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDismissedJob } from '../hooks/useDismissedJob';
import { DISMISS_STORAGE_KEY } from '../lib/dismiss-state';
import { reviewStorageKey } from '../lib/review-state';

/**
 * The store behind the dismiss control, at its own layer.
 *
 * `current-job.test.tsx` drives it through the region a reviewer sees, which is
 * the right level for "does the card clear". These are the things that level
 * cannot show: which writes the listener answers to, and which it deliberately
 * ignores. Both guards exist to avoid work, and work avoided is invisible from
 * the DOM — so they are counted here, the way `review-marks.test.tsx` counts the
 * same two for the marks store beside it.
 */

const JOB = '2026-08-17T08-00-00Z-compare';
const OTHER_JOB = '2026-08-17T09-00-00Z-capture';

/** Reads the hook and draws what it holds, so a case asserts on rendered output
 *  rather than on a hook harness's internals. */
function Dismissed() {
  const { dismissed, dismiss } = useDismissedJob();

  return (
    <div>
      <span data-testid="dismissed">{dismissed ?? 'none'}</span>
      <button type="button" onClick={() => dismiss(JOB)}>
        dismiss
      </button>
    </div>
  );
}

const shown = () => screen.getByTestId('dismissed').textContent;

/**
 * The same probe, keeping the undo `dismiss` handed back.
 *
 * Held on an object rather than in a `let`, so TypeScript does not narrow the
 * captured value to `null` at the call site — the assignment happens inside a
 * handler it cannot follow.
 */
const held: { undo: (() => void) | null } = { undo: null };

function Undoable() {
  const { dismissed, dismiss } = useDismissedJob();

  return (
    <div>
      <span data-testid="dismissed">{dismissed ?? 'none'}</span>
      <button
        type="button"
        onClick={() => {
          held.undo = dismiss(JOB);
        }}
      >
        dismiss
      </button>
    </div>
  );
}

const dismissHoldingUndo = () =>
  act(() => screen.getByRole('button', { name: 'dismiss' }).click());

/** What another tab's write looks like from in here: localStorage already holds
 *  the new value, and the event says which key moved. jsdom dispatches nothing
 *  on `setItem`, and a real browser does not fire `storage` in the writing
 *  document either — so both halves are driven by hand, which is also what the
 *  production path does. */
function writeFromAnotherTab(value: string | null, key = DISMISS_STORAGE_KEY) {
  if (value === null) localStorage.removeItem(DISMISS_STORAGE_KEY);
  else localStorage.setItem(DISMISS_STORAGE_KEY, value);

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
  held.undo = null;
});

describe('useDismissedJob', () => {
  it('starts from what this browser already holds', () => {
    localStorage.setItem(DISMISS_STORAGE_KEY, JOB);

    render(<Dismissed />);

    expect(shown()).toBe(JOB);
  });

  it('picks up a dismissal made in another tab', () => {
    render(<Dismissed />);
    expect(shown()).toBe('none');

    writeFromAnotherTab(JOB);

    expect(shown()).toBe(JOB);
  });

  // `event.key === null` is the whole store being cleared, which is this key
  // too — the one storage event that names no key and still concerns us.
  it('picks up the whole store being cleared', () => {
    localStorage.setItem(DISMISS_STORAGE_KEY, JOB);
    render(<Dismissed />);
    expect(shown()).toBe(JOB);

    localStorage.clear();
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
    });

    expect(shown()).toBe('none');
  });

  /**
   * The guard that earns its keep. The review marks live on this same origin and
   * are written constantly — every variant a reviewer ticks in another tab fires
   * a `storage` event — and without the key check each one would re-read this
   * key and notify every consumer for a write about something else.
   *
   * Counted through `getItem` rather than asserted on the DOM: the value has not
   * moved, so a store that re-read it would render exactly the same thing.
   */
  it('does not even read its key when another key moved', () => {
    render(<Dismissed />);
    const original = Storage.prototype.getItem;
    let reads = 0;
    Storage.prototype.getItem = function patched(key: string) {
      if (key === DISMISS_STORAGE_KEY) reads += 1;

      return original.call(this, key);
    };

    try {
      // The write lands, so a store that ignored the key would see a change.
      localStorage.setItem(DISMISS_STORAGE_KEY, JOB);
      act(() => {
        window.dispatchEvent(
          new StorageEvent('storage', { key: reviewStorageKey('some-report') }),
        );
      });

      expect(reads).toBe(0);
      expect(shown()).toBe('none');
    } finally {
      Storage.prototype.getItem = original;
    }
  });

  /**
   * Dismissing a run already dismissed touches nothing, and that is what makes
   * the undo free: the start button dismisses the run on the card without first
   * asking whether the reviewer had already put that same one away, and its undo
   * writes the old value back the same way.
   *
   * Counted through `setItem` and not through renders. React bails on an
   * unchanged snapshot by itself here — it is a string, not the Set the marks
   * store hands over — so a render count would stay flat with the guard deleted
   * and prove nothing. The write is what the guard actually saves.
   */
  it('writes nothing when the same run is dismissed twice', () => {
    localStorage.setItem(DISMISS_STORAGE_KEY, JOB);
    render(<Dismissed />);
    const writes = vi.spyOn(Storage.prototype, 'setItem');

    act(() => screen.getByRole('button', { name: 'dismiss' }).click());

    expect(shown()).toBe(JOB);
    expect(writes).not.toHaveBeenCalled();
  });

  it('shows a dismissal made in this tab', () => {
    render(<Dismissed />);

    act(() => {
      screen.getByRole('button', { name: 'dismiss' }).click();
    });

    expect(shown()).toBe(JOB);
    expect(localStorage.getItem(DISMISS_STORAGE_KEY)).toBe(JOB);
  });

  /**
   * The undo the start button holds while its POST is in flight. It closes over
   * what was dismissed BEFORE the click, which is the whole reason it is handed
   * back from `dismiss` rather than taken as an argument later.
   */
  it('undoes a dismissal back to nothing', () => {
    render(<Undoable />);
    dismissHoldingUndo();
    expect(shown()).toBe(JOB);

    act(() => held.undo?.());

    expect(shown()).toBe('none');
    expect(localStorage.getItem(DISMISS_STORAGE_KEY)).toBeNull();
  });

  // Undoing restores what was there before, not "nothing" — a reviewer who had
  // already put a run away by hand keeps it away through a refused start.
  it('undoes back to the dismissal it replaced', () => {
    localStorage.setItem(DISMISS_STORAGE_KEY, OTHER_JOB);
    render(<Undoable />);
    dismissHoldingUndo();
    expect(shown()).toBe(JOB);

    act(() => held.undo?.());

    expect(shown()).toBe(OTHER_JOB);
  });
});
