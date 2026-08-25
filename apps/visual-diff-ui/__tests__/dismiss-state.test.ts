// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DISMISS_STORAGE_KEY, readDismissed, setDismissed } from '../lib/dismiss-state';

/**
 * The run this browser has put away.
 *
 * Storage and nothing else: the hook above it renders from its own snapshot, so
 * what is asserted here is only what survives a reload — and what a value this
 * app did not write reads back as.
 */

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('the dismissed job id', () => {
  it('round-trips under one key', () => {
    setDismissed('2026-08-17T08-00-00Z-compare');

    const dismissed = readDismissed();

    expect(dismissed).toBe('2026-08-17T08-00-00Z-compare');
    expect(localStorage.getItem(DISMISS_STORAGE_KEY)).toBe(
      '2026-08-17T08-00-00Z-compare',
    );
  });

  it('reads nothing dismissed when nothing has been', () => {
    const dismissed = readDismissed();

    expect(dismissed).toBeNull();
  });

  // One key and one value: a second dismissal replaces the first rather than
  // accumulating beside it, so what this stores cannot grow with the history it
  // is read against.
  it('keeps only the most recent dismissal', () => {
    setDismissed('first');

    setDismissed('second');

    expect(readDismissed()).toBe('second');
  });

  // A hand-edited value, or a shape from a future version. Reading it as
  // "nothing dismissed" is recoverable; the next dismissal rewrites it.
  it('reads a value this app did not write as nothing dismissed', () => {
    localStorage.setItem(DISMISS_STORAGE_KEY, '');

    const dismissed = readDismissed();

    expect(dismissed).toBeNull();
  });

  // Private mode, and site data blocked. A console that throws on a read is a
  // worse failure than one that forgets which run was put away.
  it('reads nothing dismissed when storage refuses', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('site data is blocked');
    });

    const dismissed = readDismissed();

    expect(dismissed).toBeNull();
  });
});
