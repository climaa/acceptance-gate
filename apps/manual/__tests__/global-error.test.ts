// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setReporter } from '@gate/logger';
import { THEME_STORAGE_KEY } from '@gate/ui';
import GlobalError from '@/app/global-error';
import { ERROR_ACTION, ERROR_NOTE, ERROR_TITLE } from '@/lib/site';

/**
 * The boundary that replaces the root layout: the document it restates, what it
 * says, who it tells, and the theme it has to re-apply.
 *
 * `jsdom` for the same reason `error.test.ts` gives — reporting and the theme
 * are both effects, and an effect runs when React commits. Unlike that file,
 * this one renders `<html>` itself, so the root is the `document` rather than a
 * `<div>`: React places `<html>`, `<head>` and `<body>` as the document's own
 * singletons, which is exactly where `applyStoredTheme` writes `data-theme`.
 *
 * The reporter is INJECTED with `setReporter` rather than read off the global
 * `console`, because only the reporter survives a production build.
 */

// React's `act` refuses to flush effects unless the environment declares itself.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A layout throw as React hands one to the boundary, digest and all. */
const thrown = Object.assign(
  new Error('Unsupported Gherkin: Rule in apps/e2e/z.feature'),
  {
    digest: '3301947752',
  },
);

const other = Object.assign(
  new Error('Unsupported Gherkin: Background in apps/e2e/w.feature'),
  {
    digest: '0918273645',
  },
);

const render = () =>
  renderToStaticMarkup(createElement(GlobalError, { error: thrown, retry: vi.fn() }));

let mounted: Root | undefined;

/** Mounts the boundary as the document; `rerender` exercises the effect's key. */
function mount(error: Error, retry: () => void = vi.fn()) {
  const root = createRoot(document);
  mounted = root;

  const rerender = (next: Error): void => {
    act(() => {
      root.render(createElement(GlobalError, { error: next, retry }));
    });
  };

  rerender(error);

  return { rerender };
}

beforeEach(() => {
  // To the logger a test run looks like `next dev`, so `logger.error` prints as
  // well as reports. Silenced, never asserted on.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  if (mounted) {
    const root = mounted;
    act(() => root.unmount());
    mounted = undefined;
  }
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  setReporter(() => {});
  vi.restoreAllMocks();
});

describe('app/global-error.tsx', () => {
  // The layout that threw took its document with it, so this one has to bring
  // its own — and a title, since a `metadata` export is not available here.
  it('restates the document, titled for the failure', () => {
    const html = render();

    expect(html).toMatch(/^<html lang="en">/);
    expect(html).toContain(`<title>${ERROR_TITLE}</title>`);
    expect(html).toContain('<main id="main"');
  });

  it('names the failure under a heading and offers the way on', () => {
    const html = render();

    expect(html).toContain(`>${ERROR_TITLE}</h1>`);
    expect(html).toContain(ERROR_NOTE);
    expect(html).toMatch(new RegExp(`<button[^>]*>${ERROR_ACTION}</button>`));
  });

  // The header and footer belong to the layout that just threw.
  it('renders no header or footer', () => {
    const html = render();

    expect(html).not.toContain('<header');
    expect(html).not.toContain('<footer');
  });

  it('prints neither the thrown message nor the digest', () => {
    const html = render();

    expect(html).not.toContain('Unsupported Gherkin');
    expect(html).not.toContain(thrown.digest);
  });

  it('hands the action straight to retry', () => {
    const retry = vi.fn();
    mount(thrown, retry);

    act(() => {
      document
        .querySelector('button')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(retry).toHaveBeenCalledTimes(1);
  });

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
    expect(report.mock.calls[0]?.[0]).toBe(thrown);
  });

  it('does not report again when the same failure re-renders', () => {
    const report = vi.fn();
    setReporter(report);
    const { rerender } = mount(thrown);

    rerender(thrown);

    expect(report).toHaveBeenCalledTimes(1);
  });

  it('reports again when the failure changes', () => {
    const report = vi.fn();
    setReporter(report);
    const { rerender } = mount(thrown);

    rerender(other);

    expect(report).toHaveBeenCalledTimes(2);
    expect(report.mock.calls[1]?.[0]).toBe(other);
  });

  // The layout's inline script cannot run in a document React built, so the
  // reader's dark choice survives only because the boundary re-applies it.
  it('re-applies a stored dark theme on mount', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    mount(thrown);

    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('leaves the page light when no dark choice is stored', () => {
    mount(thrown);

    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
