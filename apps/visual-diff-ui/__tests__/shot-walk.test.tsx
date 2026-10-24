// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShotView } from '../components/ShotView';
import { prefetchCalls, replaceCalls, setSearchParams } from './stubs/next-navigation';

// The crop the overlay lays on, without fetching a board: as shot-tools mocks it.
vi.mock('../hooks/useBoardCrop', () => ({
  useBoardTiles: () => null,
  useBoardCrop: (_board: string, rect: { width: number; height: number } | null) =>
    rect
      ? {
          url: 'blob:crop',
          width: rect.width / 2,
          height: rect.height / 2,
          region: { width: rect.width / 2, height: rect.height / 2 },
        }
      : null,
}));

const SET = 'baselines';
const KEY = 'atoms__desktop__light__atoms-badge--accent';
const NEXT = 'atoms__desktop__dark__atoms-badge--accent';
const at = (key: string) => `/set/${SET}/shot/${key}`;

const replaceState = vi.fn<History['replaceState']>();

function renderView(query: string, neighbours: { prevKey?: string; nextKey?: string }) {
  setSearchParams(query);

  return render(
    <ShotView
      label={SET}
      story="Badge — Accent"
      storyId="atoms-badge--accent"
      viewport="desktop"
      theme="light"
      tier="atoms"
      homes={{}}
      shot={{
        key: KEY,
        src: `/api/sets/${SET}/shots/${KEY}.png`,
        absent: 'This screenshot could not be read.',
        caption: `screenshot · ${SET} · 1248×25`,
        alt: 'atoms-badge--accent, desktop light',
        label: 'screenshot',
      }}
      ledger={null}
      entry="direct"
      {...neighbours}
    />,
  );
}

const lastReplace = () => replaceCalls.at(-1);

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
  prefetchCalls.length = 0;
});

describe('walking the set from the shot view', () => {
  it('takes ⌥ → to the next shot, keeping the overlay and its blend but not its nudge', () => {
    renderView('view=overlay&blend=difference&offset=2,0&crop=0,0,200,100', {
      nextKey: NEXT,
    });

    fireEvent.keyDown(document, { key: 'ArrowRight', altKey: true });

    expect(lastReplace()).toEqual({
      url: `${at(NEXT)}?view=overlay&blend=difference`,
      options: { scroll: false },
    });
  });

  it('takes ⌥ ← to the previous shot, beside the board when that is the view', () => {
    renderView('', { prevKey: NEXT });

    fireEvent.keyDown(document, { key: 'ArrowLeft', altKey: true });

    expect(lastReplace()?.url).toBe(at(NEXT));
  });

  it('stays put at the end of the set, and still claims the key from the browser', () => {
    renderView('', { prevKey: NEXT });
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      altKey: true,
      cancelable: true,
    });

    document.dispatchEvent(event);

    expect({ walked: replaceCalls.length, claimed: event.defaultPrevented }).toEqual({
      walked: 0,
      claimed: true,
    });
  });

  it('walks on ⌥ alone: a bare arrow, Ctrl or ⌘ with it, go elsewhere', () => {
    renderView('', { nextKey: NEXT });

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'ArrowRight', ctrlKey: true });
    fireEvent.keyDown(document, { key: 'ArrowRight', altKey: true, metaKey: true });

    expect(replaceCalls).toEqual([]);
  });

  it('prefetches both neighbours so a press lands at once', () => {
    renderView('', {
      prevKey: NEXT,
      nextKey: 'atoms__desktop__light__atoms-badge--danger',
    });

    expect(prefetchCalls).toEqual([
      at(NEXT),
      at('atoms__desktop__light__atoms-badge--danger'),
    ]);
  });

  it('does not nudge the overlay on ⌥ with an arrow', () => {
    renderView('crop=0,0,200,100&view=overlay', { nextKey: NEXT });
    const pane = screen.getByRole('group', {
      name: 'the screenshot with the board crop over it',
    });

    const nudgedYet = () =>
      replaceState.mock.calls.some(([, , url]) => String(url).includes('offset='));

    fireEvent.keyDown(pane, { key: 'ArrowLeft', altKey: true });
    const afterAlt = nudgedYet();
    // The control: the same arrow, bare, does nudge.
    fireEvent.keyDown(pane, { key: 'ArrowLeft' });

    expect({ afterAlt, afterBare: nudgedYet() }).toEqual({
      afterAlt: false,
      afterBare: true,
    });
  });
});
