// @vitest-environment jsdom
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
// Imported explicitly rather than relying on `globals: true` — same reason as
// pages.test.ts: tsconfig's `**/*.ts` include means tsc typechecks this file.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setReporter } from '@gate/logger';
import ErrorBoundary from '../app/error';
import GlobalError from '../app/global-error';
import { ERROR_ACTION, ERROR_NOTE, ERROR_TITLE } from '../lib/site';
import { THEME_SCRIPT } from '../lib/theme';

/**
 * The two error boundaries: what they say, what they refuse to say, who they
 * tell, and what the outer one has to rebuild because it replaces the root
 * layout.
 *
 * The one file in this suite that declares `jsdom`; every other runs under the
 * app's `environment: 'node'`. Most of the claims below are about output and
 * are read off markup, which needs no document — but reporting is an effect,
 * and an effect runs when React commits, so it needs something to commit into.
 * The same document then carries the one interactive claim, that the button is
 * wired to `retry`. That used to be read off the element tree by calling the
 * boundary as a plain function; a component with a hook is not callable that
 * way, so it is a real click now.
 *
 * Where a case asserts that a boundary reported, the reporter is INJECTED with
 * `setReporter` rather than read off the global `console`. `logger.error` does
 * both, but only one of them survives a production build: there the console is
 * silent and the reporter is the entire mechanism.
 */

// React's `act` refuses to flush effects unless the environment declares itself.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Boundary = ComponentType<{ error: Error; retry: () => void }>;

/** A server error as React hands one to a boundary in production: the message is
 *  already redacted by then, and `digest` is the key into the platform's logs. */
const thrown = Object.assign(new Error('ENOENT: content/posts/secret.mdx'), {
  digest: '2749185043',
});

const other = Object.assign(new Error('Invalid frontmatter: content/posts/two.mdx'), {
  digest: '1180453992',
});

const renderBoundary = () =>
  renderToStaticMarkup(createElement(ErrorBoundary, { error: thrown, retry: vi.fn() }));

const renderGlobal = () =>
  renderToStaticMarkup(createElement(GlobalError, { error: thrown, retry: vi.fn() }));

const mounted: Root[] = [];

/** Mounts a boundary; `rerender` is how the effect's key gets exercised. */
function mount(Boundary: Boundary, error: Error, retry: () => void = vi.fn()) {
  // Detached: `global-error.tsx` draws a whole `<html>`, which cannot nest
  // inside the one jsdom already has. Under test is what the commit does, not
  // where React parked the markup.
  const container = document.createElement('div');
  const root = createRoot(container);
  mounted.push(root);

  const rerender = (next: Error): void => {
    act(() => {
      root.render(createElement(Boundary, { error: next, retry }));
    });
  };

  rerender(error);

  return { container, rerender };
}

beforeEach(() => {
  // Every mount below reports, and to the logger a test run looks like
  // `next dev` — so `logger.error` prints as well as reports. Silenced here,
  // never asserted on: see the header for why the reporter is the half that
  // matters.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  mounted.splice(0).forEach((root) => act(() => root.unmount()));
  // `global-error.tsx` writes the reader's theme onto the real `<html>` on
  // mount — jsdom's, here — so a mount leaks that attribute to whatever runs
  // next unless it is cleared.
  delete document.documentElement.dataset.theme;
  setReporter(() => {});
  vi.restoreAllMocks();
});

describe('app/error.tsx', () => {
  it('names the failure and offers the way on', () => {
    const html = renderBoundary();

    expect(html).toContain(ERROR_TITLE);
    expect(html).toContain(ERROR_NOTE);
    expect(html).toContain(ERROR_ACTION);
  });

  it('hands the action straight to retry', () => {
    const retry = vi.fn();
    const { container } = mount(ErrorBoundary, thrown, retry);

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

    mount(ErrorBoundary, thrown, retry);

    expect(retry).not.toHaveBeenCalled();
  });

  // The reason `error` is never rendered. In production React replaces a
  // server error's message with a generic string, but this suite renders in
  // development, where the real one is forwarded — so a boundary that printed
  // it would leak a filesystem path and pass its own test.
  it('prints neither the thrown message nor the digest', () => {
    const html = renderBoundary();

    expect(html).not.toContain('ENOENT');
    expect(html).not.toContain(thrown.digest);
  });

  // The other half of that same paragraph: what the reader is refused is
  // exactly what the reporter is handed.
  it('hands the reporter the Error object itself, once', () => {
    const report = vi.fn();
    setReporter(report);

    mount(ErrorBoundary, thrown);

    expect(report).toHaveBeenCalledTimes(1);
    // `toBe`, not `toEqual`: a formatted string or a rebuilt Error would satisfy
    // equality while costing the reporter the stack and digest this one carries.
    expect(report.mock.calls[0]?.[0]).toBe(thrown);
  });

  // One side of the dependency array: without one, the effect reports on every
  // render.
  it('does not report again when the same failure re-renders', () => {
    const report = vi.fn();
    setReporter(report);
    const { rerender } = mount(ErrorBoundary, thrown);

    rerender(thrown);

    expect(report).toHaveBeenCalledTimes(1);
  });

  // The other side: with an empty one, the second failure is never reported.
  it('reports again when the failure changes', () => {
    const report = vi.fn();
    setReporter(report);
    const { rerender } = mount(ErrorBoundary, thrown);

    rerender(other);

    expect(report).toHaveBeenCalledTimes(2);
    expect(report.mock.calls[1]?.[0]).toBe(other);
  });
});

describe('app/global-error.tsx', () => {
  // It replaces the root layout rather than rendering inside it, so anything
  // the layout supplied is gone unless this file restates it.
  it('rebuilds the document the root layout would have drawn', () => {
    const html = renderGlobal();

    expect(html).toContain('<html lang="en"');
    expect(html).toContain('<body>');
    expect(html).toContain(`<title>${ERROR_TITLE}</title>`);
  });

  /**
   * It must NOT carry a copy of the layout's inline script. React builds this
   * document rather than parsing it, so a `<script>` here never executes — and
   * one that never executes reads, to the next person, as a theme that is
   * handled. `applyStoredTheme` on mount is what actually carries it; the rule
   * itself is covered in theme.test.ts, and the console's jsdom suite asserts
   * the attribute a mounted boundary leaves behind.
   */
  it('ships no inline theme script, which could not run here', () => {
    const html = renderGlobal();

    expect(html).not.toContain(THEME_SCRIPT);
    expect(html).not.toContain('<script');
  });

  it('prints neither the thrown message nor the digest', () => {
    const html = renderGlobal();

    expect(html).not.toContain('ENOENT');
    expect(html).not.toContain(thrown.digest);
  });

  // The boundary for the throw nothing else in the app can catch, and so the
  // one whose report matters most.
  it('hands the reporter the Error object itself, once', () => {
    const report = vi.fn();
    setReporter(report);

    mount(GlobalError, thrown);

    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0]?.[0]).toBe(thrown);
  });
});
