// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setReporter } from '@gate/logger';

import ErrorBoundary from '@/app/error';

/**
 * census's error boundary: what it says, what it refuses to say, who it tells,
 * and what its one button does.
 *
 * Declares `jsdom` for itself, as apps/blog/__tests__/error.test.ts does, whose
 * shape this follows: the copy is read off static markup, but reporting is an
 * effect and the retry is a click, and both need a document to commit into.
 *
 * Where a case asserts that the boundary reported, the reporter is INJECTED with
 * `setReporter` rather than read off the global `console`: in a production build
 * the console is silent and the reporter is the whole mechanism.
 */

// React's `act` refuses to flush effects unless the environment declares itself.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A server error as React hands one to a boundary: `digest` is the key into
 *  the platform's logs, and the message is one no reader should see. */
const thrown = Object.assign(new Error('ENOENT: apps/census/measurement.json'), {
  digest: '3021957714',
});

const other = Object.assign(new Error('Invalid history: apps/census/history.json'), {
  digest: '8810342276',
});

const render = () =>
  renderToStaticMarkup(createElement(ErrorBoundary, { error: thrown, retry: vi.fn() }));

const mounted: Root[] = [];

/** Mounts the boundary into a document; `rerender` exercises the effect's key. */
function mount(error: Error, retry: () => void = vi.fn()) {
  const container = document.createElement('div');
  const root = createRoot(container);
  mounted.push(root);

  const rerender = (next: Error): void => {
    act(() => {
      root.render(createElement(ErrorBoundary, { error: next, retry }));
    });
  };

  rerender(error);

  return { container, rerender };
}

beforeEach(() => {
  // To the logger a test run looks like `next dev`, so `logger.error` prints as
  // well as reports. Silenced, never asserted on — the reporter is the half
  // that survives a production build.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  mounted.splice(0).forEach((root) => act(() => root.unmount()));
  setReporter(() => {});
  vi.restoreAllMocks();
});

describe('app/error.tsx', () => {
  it("draws inside census's own frame, under its title", () => {
    const html = render();

    expect(html).toContain('<main class="census-main">');
    expect(html).toContain('<h1 class="census-title">Census</h1>');
  });

  it('names the failure and offers the way on', () => {
    const html = render();

    expect(html).toContain('This page could not be drawn.');
    expect(html).toMatch(/<button[^>]*>Try again<\/button>/);
  });

  // In development React forwards the real message, so a boundary that printed
  // it would leak a path and still pass a test that only read production copy.
  it('prints neither the thrown message nor the digest', () => {
    const html = render();

    expect(html).not.toContain('ENOENT');
    expect(html).not.toContain(thrown.digest);
  });

  it('hands the button straight to retry', () => {
    const retry = vi.fn();
    const { container } = mount(thrown, retry);

    act(() => {
      container
        .querySelector('button')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(retry).toHaveBeenCalledTimes(1);
  });

  // A boundary that retried while rendering would re-throw and retry again.
  it('does not retry on render', () => {
    const retry = vi.fn();

    mount(thrown, retry);

    expect(retry).not.toHaveBeenCalled();
  });

  // What the reader is refused is exactly what the reporter is handed.
  it('hands the reporter the Error object itself, once', () => {
    const report = vi.fn();
    setReporter(report);

    mount(thrown);

    expect(report).toHaveBeenCalledTimes(1);
    // `toBe`, not `toEqual`: a rebuilt Error or a string would cost the
    // reporter the stack and digest this one carries.
    expect(report.mock.calls[0]?.[0]).toBe(thrown);
  });

  // One side of the dependency array: without one, every render reports.
  it('does not report again when the same failure re-renders', () => {
    const report = vi.fn();
    setReporter(report);
    const { rerender } = mount(thrown);

    rerender(thrown);

    expect(report).toHaveBeenCalledTimes(1);
  });

  // The other side: with an empty one, a second failure goes unreported.
  it('reports again when the failure changes', () => {
    const report = vi.fn();
    setReporter(report);
    const { rerender } = mount(thrown);

    rerender(other);

    expect(report).toHaveBeenCalledTimes(2);
    expect(report.mock.calls[1]?.[0]).toBe(other);
  });
});
