// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ErrorBoundary from '../app/error';
import GlobalError from '../app/global-error';
import { ERROR_ACTION, ERROR_NOTE, ERROR_TITLE } from '../lib/site';
import { THEME_SCRIPT } from '../lib/theme';

/**
 * The console's error boundary: what a reviewer gets when a read throws rather
 * than coming back empty.
 *
 * `lib/data.ts` throws deliberately on a summary that no longer matches the
 * schema, so this is not a theoretical path — it is the screen behind every
 * report the console cannot parse.
 *
 * `app/global-error.tsx` is read as markup rather than mounted. It renders a
 * whole `<html>` document, which `render()` cannot nest inside the one jsdom
 * already has — so the cases below assert its output the way the blog's suite
 * asserts its own.
 */

afterEach(cleanup);

const thrown = Object.assign(new Error('Unexpected token < in JSON at position 0'), {
  digest: '3310027745',
});

describe('app/error.tsx', () => {
  it('names the failure and offers the way on', () => {
    render(<ErrorBoundary error={thrown} retry={vi.fn()} />);

    expect(screen.getByText(ERROR_NOTE)).toBeDefined();
    expect(screen.getByRole('button', { name: ERROR_ACTION })).toBeDefined();
  });

  it('retries the segment when the reviewer presses the way on', () => {
    const retry = vi.fn();
    render(<ErrorBoundary error={thrown} retry={retry} />);

    fireEvent.click(screen.getByRole('button', { name: ERROR_ACTION }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  // A boundary that retried while rendering would throw again and loop.
  it('does not retry on render', () => {
    const retry = vi.fn();

    render(<ErrorBoundary error={thrown} retry={retry} />);

    expect(retry).not.toHaveBeenCalled();
  });

  /**
   * THE constraint on this file, not a preference. apps/e2e/pages/console.ts
   * reads every console refusal with a strict
   * `getByRole('main').getByRole('alert')`, so a second alert inside `main`
   * fails that locator on every scenario that uses one — including scenarios
   * that have nothing to do with an error boundary.
   */
  it('draws no alert, which the e2e refusal locator would match a second time', () => {
    const { container } = render(<ErrorBoundary error={thrown} retry={vi.fn()} />);

    expect(within(container).queryByRole('alert')).toBeNull();
  });

  // In production React redacts a server error's message and hands the real one
  // to the platform's logs under `digest`. This suite renders in development,
  // where the message is forwarded intact — so a boundary that printed it would
  // leak the parse failure and still pass a laxer test.
  it('prints neither the thrown message nor the digest', () => {
    const { container } = render(<ErrorBoundary error={thrown} retry={vi.fn()} />);

    expect(container.textContent).not.toContain('Unexpected token');
    expect(container.textContent).not.toContain(thrown.digest);
  });
});

describe('app/global-error.tsx', () => {
  const renderGlobal = () =>
    renderToStaticMarkup(<GlobalError error={thrown} retry={vi.fn()} />);

  // It replaces the root layout rather than rendering inside it, so anything the
  // layout supplied is gone unless this file restates it.
  it('rebuilds the document the root layout would have drawn', () => {
    const html = renderGlobal();

    expect(html).toContain('<html lang="en"');
    expect(html).toContain('<body>');
    expect(html).toContain(`<title>${ERROR_TITLE}</title>`);
  });

  /**
   * Without this the console would have one surface whose theme comes from the
   * capture machine's OS rather than from the `[data-theme]` attribute the
   * toggle writes — the split CODING_STANDARDS calls absolute for this app.
   */
  it('re-runs the theme script the layout would have run', () => {
    const html = renderGlobal();

    expect(html).toContain(THEME_SCRIPT);
  });

  it('draws no alert, and prints neither the thrown message nor the digest', () => {
    const html = renderGlobal();

    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('Unexpected token');
    expect(html).not.toContain(thrown.digest);
  });
});
