// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setReporter } from '@gate/logger';
import ErrorBoundary from '@/app/error';
import { ERROR_ACTION, ERROR_NOTE, ERROR_TITLE } from '@/lib/site';

/**
 * The boundary under the root layout: what it says, what it refuses to say, and
 * who it tells.
 *
 * The one file in this suite that declares `jsdom`; every other runs under the
 * app's `environment: 'node'`. What the boundary renders is read off markup and
 * needs no document — but reporting is an effect, and an effect runs when React
 * commits, so it needs something to commit into. The same document carries the
 * one interactive claim, that the button is wired to `retry`.
 *
 * Where a case asserts that the boundary reported, the reporter is INJECTED with
 * `setReporter` rather than read off the global `console`. `logger.error` does
 * both, but only the reporter survives a production build.
 */

// React's `act` refuses to flush effects unless the environment declares itself.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A server error as React hands one to a boundary: `digest` is the key into the
 *  platform's logs, and the message is what `lib/features.ts` throws. */
const thrown = Object.assign(
  new Error('Unsupported Gherkin: DocString in apps/e2e/x.feature'),
  {
    digest: '2749185043',
  },
);

const other = Object.assign(
  new Error('Unsupported Gherkin: Rule in apps/e2e/y.feature'),
  {
    digest: '1180453992',
  },
);

const render = () =>
  renderToStaticMarkup(createElement(ErrorBoundary, { error: thrown, retry: vi.fn() }));

const mounted: Root[] = [];

/** Mounts the boundary; `rerender` is how the effect's key gets exercised. */
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
  // well as reports. Silenced, never asserted on: the reporter is the half that
  // matters.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  mounted.splice(0).forEach((root) => act(() => root.unmount()));
  setReporter(() => {});
  vi.restoreAllMocks();
});

describe('app/error.tsx', () => {
  it('names the failure under a heading and offers the way on', () => {
    const html = render();

    expect(html).toContain(`>${ERROR_TITLE}</h1>`);
    expect(html).toContain(ERROR_NOTE);
    expect(html).toMatch(new RegExp(`<button[^>]*>${ERROR_ACTION}</button>`));
  });

  // In production React redacts a server error's message, but this suite runs
  // in development, where the real one is forwarded — so a boundary that printed
  // it would leak a feature path and still pass a test that only checked copy.
  it('prints neither the thrown message nor the digest', () => {
    const html = render();

    expect(html).not.toContain('Unsupported Gherkin');
    expect(html).not.toContain(thrown.digest);
  });

  it('hands the action straight to retry', () => {
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
  it('does not retry on its own', () => {
    const retry = vi.fn();

    mount(thrown, retry);

    expect(retry).not.toHaveBeenCalled();
  });

  it('hands the reporter the Error object itself, once', () => {
    const report = vi.fn();
    setReporter(report);

    mount(thrown);

    expect(report).toHaveBeenCalledTimes(1);
    // `toBe`, not `toEqual`: a formatted string or a rebuilt Error would satisfy
    // equality while costing the reporter the stack and digest this one carries.
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

  // The other side: with an empty one, a second failure is never reported.
  it('reports again when the failure changes', () => {
    const report = vi.fn();
    setReporter(report);
    const { rerender } = mount(thrown);

    rerender(other);

    expect(report).toHaveBeenCalledTimes(2);
    expect(report.mock.calls[1]?.[0]).toBe(other);
  });
});
