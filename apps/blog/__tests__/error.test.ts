import { createElement } from 'react';
// Imported explicitly rather than relying on `globals: true` — same reason as
// pages.test.ts: tsconfig's `**/*.ts` include means tsc typechecks this file.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import ErrorBoundary from '../app/error';
import GlobalError from '../app/global-error';
import { ERROR_ACTION, ERROR_NOTE, ERROR_TITLE } from '../lib/site';
import { THEME_SCRIPT } from '../lib/theme';

/**
 * The two error boundaries: what they say, what they refuse to say, and what
 * the outer one has to rebuild because it replaces the root layout.
 *
 * Rendered as markup rather than driven in a browser — this app's suite is
 * `environment: 'node'` with no jsdom, and every claim below is about output
 * rather than interaction. The one interactive claim, that the button is wired
 * to `retry`, is read off the element tree instead of a click.
 */

/** A server error as React hands one to a boundary in production: the message is
 *  already redacted by then, and `digest` is the key into the platform's logs. */
const thrown = Object.assign(new Error('ENOENT: content/posts/secret.mdx'), {
  digest: '2749185043',
});

const renderBoundary = (retry: () => void) =>
  renderToStaticMarkup(createElement(ErrorBoundary, { error: thrown, retry }));

const renderGlobal = (retry: () => void) =>
  renderToStaticMarkup(createElement(GlobalError, { error: thrown, retry }));

describe('app/error.tsx', () => {
  it('names the failure and offers the way on', () => {
    const html = renderBoundary(vi.fn());

    expect(html).toContain(ERROR_TITLE);
    expect(html).toContain(ERROR_NOTE);
    expect(html).toContain(ERROR_ACTION);
  });

  it('hands the action straight to retry, without calling it on render', () => {
    const retry = vi.fn();

    const action = ErrorBoundary({ error: thrown, retry }).props.emptyAction;

    expect(action.props.onClick).toBe(retry);
    // A boundary that retried while rendering would re-throw and retry again.
    expect(retry).not.toHaveBeenCalled();
  });

  // The reason `error` is never destructured. In production React replaces a
  // server error's message with a generic string, but this suite renders in
  // development, where the real one is forwarded — so a boundary that printed
  // it would leak a filesystem path and pass its own test.
  it('prints neither the thrown message nor the digest', () => {
    const html = renderBoundary(vi.fn());

    expect(html).not.toContain('ENOENT');
    expect(html).not.toContain(thrown.digest);
  });
});

describe('app/global-error.tsx', () => {
  // It replaces the root layout rather than rendering inside it, so anything
  // the layout supplied is gone unless this file restates it.
  it('rebuilds the document the root layout would have drawn', () => {
    const html = renderGlobal(vi.fn());

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
    const html = renderGlobal(vi.fn());

    expect(html).not.toContain(THEME_SCRIPT);
    expect(html).not.toContain('<script');
  });

  it('prints neither the thrown message nor the digest', () => {
    const html = renderGlobal(vi.fn());

    expect(html).not.toContain('ENOENT');
    expect(html).not.toContain(thrown.digest);
  });
});
