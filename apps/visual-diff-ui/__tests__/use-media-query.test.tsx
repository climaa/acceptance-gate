// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REDUCED_MOTION, WIDE_VIEWPORT, useMediaQuery } from '../hooks/useMediaQuery';

/**
 * A media query as a React value.
 *
 * jsdom has no `matchMedia`, so every suite that renders `ComparisonModal` has
 * been exercising the ABSENT branch and only that one — the hook's stated
 * fallback path, taken by accident rather than on purpose. What no test reached is
 * the case a browser actually runs: a `matchMedia` that answers, and answers
 * differently for the two queries this app asks.
 *
 * The default is the caller's because the two questions have different safe
 * answers: a width the server cannot know defaults to the wider layout, while
 * "does this reader want motion stopped" defaults to no.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A `matchMedia` that answers `matches` per query and records its listeners. */
function stubMatchMedia(answers: Record<string, boolean>) {
  const listeners = new Map<string, () => void>();

  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: answers[query] ?? false,
      addEventListener: (_: string, fn: () => void) => listeners.set(query, fn),
      removeEventListener: () => listeners.delete(query),
    })),
  );

  return listeners;
}

function read(query: string, fallback: boolean): string {
  let seen = '';

  function Probe() {
    seen = String(useMediaQuery(query, fallback));

    return null;
  }

  render(<Probe />);

  return seen;
}

describe('with no matchMedia — jsdom, and any server render', () => {
  it('answers the caller stated default', () => {
    vi.stubGlobal('matchMedia', undefined);

    expect(read(WIDE_VIEWPORT, true)).toBe('true');
    expect(read(REDUCED_MOTION, false)).toBe('false');
  });
});

describe('with a matchMedia that answers', () => {
  it('reads the real answer rather than the fallback', () => {
    stubMatchMedia({ [WIDE_VIEWPORT]: true, [REDUCED_MOTION]: true });

    // Both opposite to the fallback, so a hook ignoring the query would fail.
    expect(read(WIDE_VIEWPORT, false)).toBe('true');
    expect(read(REDUCED_MOTION, false)).toBe('true');
  });

  it('answers each query on its own', () => {
    stubMatchMedia({ [WIDE_VIEWPORT]: true, [REDUCED_MOTION]: false });

    expect(read(WIDE_VIEWPORT, false)).toBe('true');
    expect(read(REDUCED_MOTION, true)).toBe('false');
  });

  /** Subscribed, not polled: the modal's layout follows a window that is resized
   *  while it is open. */
  it('subscribes to the query it was given', () => {
    const listeners = stubMatchMedia({ [WIDE_VIEWPORT]: false });

    read(WIDE_VIEWPORT, false);

    expect(listeners.has(WIDE_VIEWPORT)).toBe(true);
  });

  it('drops the subscription when the caller goes away', () => {
    const listeners = stubMatchMedia({ [WIDE_VIEWPORT]: false });

    read(WIDE_VIEWPORT, false);
    cleanup();

    expect(listeners.has(WIDE_VIEWPORT)).toBe(false);
  });
});
