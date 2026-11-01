// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ComparisonEntry, ComparisonRoute } from '../components/ComparisonRoute';
import { comparisonHref, comparisonPath, reportPath } from '../lib/comparison';
import type { Variant } from '../lib/summary';
import {
  backCalls,
  replaceCalls,
  setPathname,
  setSearchParams,
} from './stubs/next-navigation';
import { SITE_TITLE } from '../lib/site';

/**
 * The comparison's route: which variant and mode an address opens on, how the
 * address follows the modal, and where closing goes for each way in.
 *
 * The modal's own surface — modes, slider, keyboard — is
 * comparison-modal.test.tsx's. This is the wiring between it and the URL bar.
 */

const REPORT = 'main-2026-08-17__main-2026-08-13';
const SIDES = { a: 'main-2026-08-17', b: 'main-2026-08-13' };

function variant(key: string, id: string, theme: 'light' | 'dark'): Variant {
  return {
    key,
    id,
    tier: 'atoms',
    viewport: 'desktop',
    theme,
    bucket: 'changed',
    overlapDiffPixels: 4213,
    marginPixels: 0,
    diffPixels: 4213,
    allowedDiffPixels: 292,
    width: 1248,
    height: 469,
    sizeDelta: null,
    violations: [],
    error: null,
  };
}

const LIGHT = variant(
  'atoms__desktop__light__atoms-prose--default',
  'atoms-prose--default',
  'light',
);
const DARK = variant(
  'atoms__desktop__dark__atoms-prose--default',
  'atoms-prose--default',
  'dark',
);

const replaceState = vi.fn<History['replaceState']>();

const routeElement = (entry: ComparisonEntry) => (
  <ComparisonRoute
    reportId={REPORT}
    variants={[LIGHT, DARK]}
    sides={SIDES}
    ledger={null}
    entry={entry}
    homes={{}}
  />
);

function renderRoute(entry: ComparisonEntry, query = '', key = LIGHT.key) {
  setSearchParams(query);
  setPathname(comparisonPath(REPORT, key));

  return render(routeElement(entry));
}

const modal = () => screen.getByRole('dialog', { name: 'Comparison' });
const pressed = () =>
  within(within(modal()).getByRole('toolbar'))
    .getAllByRole('button')
    .filter((button) => button.getAttribute('aria-pressed') === 'true')
    .map((button) => button.textContent);
const lastWritten = () => replaceState.mock.calls.at(-1)?.[2];

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('min-width'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  window.history.replaceState = replaceState;
});

afterEach(() => {
  cleanup();
  replaceState.mockReset();
  replaceCalls.length = 0;
  backCalls.length = 0;
  setPathname('/');
});

describe('opening a comparison by its address', () => {
  it('opens on the mode the link names', () => {
    renderRoute('direct', 'mode=slider');

    expect(pressed()).toEqual(['slider']);
  });

  it('opens on the default mode when the link names none', () => {
    renderRoute('direct');

    expect(pressed()).toEqual(['diff']);
  });

  it('opens on the default mode for a mode that is not one', () => {
    renderRoute('direct', 'mode=sideways');

    expect(pressed()).toEqual(['diff']);
  });

  it('opens on the variant the address names', () => {
    renderRoute('direct', '', DARK.key);

    expect(within(modal()).getByRole('heading').textContent).toContain('dark');
  });

  // Next keeps a route it has left mounted but hidden. Reopened, it must show
  // what the address names now, not what it was showing when it was hidden.
  it('follows the address rather than remembering a variant', () => {
    const { rerender } = renderRoute('report');

    setPathname(comparisonPath(REPORT, DARK.key));
    rerender(routeElement('report'));

    expect(within(modal()).getByRole('heading').textContent).toContain('dark');
  });

  // A walk writes the address natively, which never re-runs `generateMetadata`.
  it('retitles the tab with the variant the address names now', () => {
    const { rerender } = renderRoute('report');

    setPathname(comparisonPath(REPORT, DARK.key));
    rerender(routeElement('report'));

    expect(document.title).toBe(`Prose — Default · desktop/dark · ${SITE_TITLE}`);
  });

  it("puts the report's title back on the way out", () => {
    const { rerender } = renderRoute('report');

    setPathname(reportPath(REPORT));
    rerender(routeElement('report'));

    expect(document.title).toBe(`${REPORT} · ${SITE_TITLE}`);
  });

  it('draws nothing once the address is the report again', () => {
    const { rerender } = renderRoute('report');

    setPathname(reportPath(REPORT));
    rerender(routeElement('report'));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // The page checks the key before it renders this; drawn anyway, the route
  // draws nothing rather than a dialog with no variant in it.
  it('draws nothing for a key it was not given', () => {
    renderRoute('direct', '', 'atoms__desktop__light__atoms-gone--default');

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('the address following the modal', () => {
  it('writes the next variant when the arrows walk to it, keeping the mode', () => {
    renderRoute('report', 'mode=slider');

    fireEvent.keyDown(document, { key: 'ArrowRight' });

    expect(lastWritten()).toBe(comparisonHref(REPORT, DARK.key, 'slider'));
  });

  it('writes the mode the toolbar switched to', () => {
    renderRoute('report');

    fireEvent.click(within(modal()).getByRole('button', { name: 'blink' }));

    expect(lastWritten()).toBe(`${comparisonPath(REPORT, LIGHT.key)}?mode=blink`);
  });

  // A router navigation would remount the dialog and drop the reviewer's
  // focus on every arrow press. The native write does neither.
  it('never asks the router to navigate for a walk', () => {
    renderRoute('report');

    fireEvent.keyDown(document, { key: 'ArrowRight' });

    expect(replaceCalls).toEqual([]);
  });
});

describe('reading against a design board', () => {
  const modalGroup = (name: string) => within(modal()).getByRole('group', { name });

  it('opens the design view an address asks for, on the variant default board', () => {
    renderRoute('direct', 'against=design');

    const pressed = within(modalGroup('board'))
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
      .map((button) => button.textContent);

    expect(pressed).toEqual(['atoms']);
  });

  it('opens the board an address names', () => {
    renderRoute('direct', 'against=design&board=x-visual-diff-pages');

    expect(
      within(modal()).getByRole('img', { name: 'the console design board' }),
    ).toBeTruthy();
  });

  it('ignores a board that is not one of the exports', () => {
    renderRoute('direct', 'against=design&board=../secrets');

    expect(
      within(modal()).getByRole('img', { name: 'the atoms design board' }),
    ).toBeTruthy();
  });

  it('writes against=design when the toggle switches, keeping the mode', () => {
    renderRoute('report', 'mode=slider');

    fireEvent.click(
      within(modalGroup('compare to')).getByRole('button', { name: 'design' }),
    );

    expect(lastWritten()).toBe(
      comparisonHref(REPORT, LIGHT.key, 'slider', { against: 'design' }),
    );
  });

  it('writes a picked board into the address', () => {
    renderRoute('report', 'against=design');

    fireEvent.click(within(modalGroup('board')).getByRole('button', { name: 'pages' }));

    expect(lastWritten()).toBe(
      comparisonHref(REPORT, LIGHT.key, null, { against: 'design', board: '05-pages' }),
    );
  });

  // Picking the board the variant opens on anyway is not a choice to record.
  it('drops the board from the address when the default one is picked again', () => {
    renderRoute('report', 'against=design&board=05-pages');

    fireEvent.click(within(modalGroup('board')).getByRole('button', { name: 'atoms' }));

    expect(lastWritten()).toBe(
      comparisonHref(REPORT, LIGHT.key, null, { against: 'design' }),
    );
  });

  it('keeps the design view when the arrows walk to another variant', () => {
    renderRoute('report', 'against=design&board=05-pages');

    fireEvent.keyDown(document, { key: 'ArrowRight' });

    expect(lastWritten()).toBe(
      comparisonHref(REPORT, DARK.key, null, { against: 'design', board: '05-pages' }),
    );
  });
});

describe('closing', () => {
  it('goes back to the report it was opened from', () => {
    renderRoute('report');

    fireEvent.click(within(modal()).getByRole('button', { name: 'close' }));

    expect(backCalls).toEqual(['back']);
  });

  it('goes back on escape too', () => {
    renderRoute('report');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(backCalls).toEqual(['back']);
  });

  // Loaded cold, there may be nothing behind this entry, or another site.
  // Closing lands on the report instead of walking out of the console.
  it('replaces a cold-loaded comparison with its report', () => {
    renderRoute('direct');

    fireEvent.click(within(modal()).getByRole('button', { name: 'close' }));

    expect(backCalls).toEqual([]);
    expect(replaceCalls).toEqual([
      { url: reportPath(REPORT), options: { scroll: false } },
    ]);
  });
});
