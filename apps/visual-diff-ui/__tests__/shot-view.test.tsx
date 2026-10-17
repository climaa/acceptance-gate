// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ShotEntry, ShotView } from '../components/ShotView';
import type { Readings } from '../lib/readings';
import { backCalls, setSearchParams } from './stubs/next-navigation';

/**
 * The shot view: one screenshot of a set beside a design board, as a modal over
 * the set or as the page when its address is loaded cold.
 *
 * The board pane, the panes' zoom and the readings table are DesignStage's and
 * SpacingReadings' own suites; this is what the view adds around them.
 */

const SET = 'main-2026-10-16';
const KEY = 'atoms__desktop__light__atoms-badge--accent';
const TITLE = `Badge — Accent · desktop/light · ${SET}`;

const LEDGER: Readings = {
  key: KEY,
  mode: 'every',
  rows: [
    {
      label: 'ds-badge',
      property: 'padding-right',
      change: 'present',
      before: null,
      after: { px: 8, token: '--space-2', origin: 'regular', classification: 'token' },
      rect: [0, 4, 41.48, 20.8],
    },
  ],
};

const replaceState = vi.fn<History['replaceState']>();

function renderView(entry: ShotEntry, query = '') {
  setSearchParams(query);

  return render(
    <ShotView
      label={SET}
      title={TITLE}
      tier="atoms"
      shot={{
        key: KEY,
        src: `/api/sets/${SET}/shots/${KEY}.png`,
        absent: 'This screenshot could not be read.',
        caption: `screenshot · ${SET} · 1248×25`,
        alt: 'atoms-badge--accent, desktop light',
        label: 'screenshot',
      }}
      ledger={LEDGER}
      entry={entry}
    />,
  );
}

const pressedIn = (group: HTMLElement) =>
  within(group)
    .getAllByRole('button')
    .filter((button) => button.getAttribute('aria-pressed') === 'true')
    .map((button) => button.textContent);

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
  backCalls.length = 0;
  document.title = '';
});

describe('the shot view, opened from its set', () => {
  it('opens as a dialog named for what it holds', () => {
    renderView('set');

    const dialog = screen.getByRole('dialog', { name: 'Screenshot' });

    expect(within(dialog).getByRole('heading', { level: 2 }).textContent).toBe(TITLE);
  });

  // A set screenshot is no comparison: nothing to compare it to, no mode to run.
  it('offers no compare-to control and no comparison modes', () => {
    renderView('set');

    expect({
      against: screen.queryByRole('group', { name: 'compare to' }),
      modes: screen.queryByRole('toolbar'),
    }).toEqual({ against: null, modes: null });
  });

  it('folds the readings to one line, because here the pixels are the point', () => {
    renderView('set');

    expect(screen.getByRole('button', { name: 'show' })).toBeTruthy();
  });

  it('closes back to the set it was opened over', () => {
    renderView('set');

    fireEvent.click(screen.getByRole('button', { name: 'close' }));

    expect(backCalls).toEqual(['back']);
  });

  // Next holds the set mounted and does not re-apply its metadata on the way
  // back, so the view puts the set's title back itself.
  it('titles the tab while open, and gives the set its title back on close', () => {
    const { unmount } = renderView('set');
    const open = document.title;

    unmount();

    expect({ open, closed: document.title }).toEqual({
      open: `${TITLE} · visual-diff console`,
      closed: `${SET} · visual-diff console`,
    });
  });
});

describe('the shot view, loaded on its own', () => {
  it('is the page, with the way back to the set in place of a close button', () => {
    renderView('direct');

    expect({
      dialog: screen.queryByRole('dialog'),
      close: screen.queryByRole('button', { name: 'close' }),
      back: screen.getByRole('link', { name: `← set ${SET}` }).getAttribute('href'),
    }).toEqual({ dialog: null, close: null, back: `/set/${SET}` });
  });

  it('opens the readings, with the room a page has', () => {
    renderView('direct');

    expect(screen.getByRole('table', { name: 'Spacing readings' })).toBeTruthy();
  });
});

describe('the shot view’s board', () => {
  it('opens on the board the tier lives on', () => {
    renderView('direct');

    expect(pressedIn(screen.getByRole('group', { name: 'board' }))).toEqual([
      'components',
    ]);
  });

  it('opens on the board the address names', () => {
    renderView('direct', 'board=pages');

    expect(pressedIn(screen.getByRole('group', { name: 'board' }))).toEqual(['pages']);
  });

  it('writes a picked board into the address, and keeps the tier’s own board bare', () => {
    renderView('direct', 'board=pages');
    const picker = screen.getByRole('group', { name: 'board' });

    fireEvent.click(within(picker).getByRole('button', { name: 'flows' }));
    fireEvent.click(within(picker).getByRole('button', { name: 'components' }));

    expect(replaceState.mock.calls.map((call) => call[2])).toEqual([
      `/set/${SET}/shot/${KEY}?board=flows-decisions`,
      `/set/${SET}/shot/${KEY}`,
    ]);
  });
});
