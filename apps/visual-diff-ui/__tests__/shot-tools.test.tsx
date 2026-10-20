// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Activity } from 'react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { zoomIndexOf } from '../lib/overlay-params';
import { ShotView } from '../components/ShotView';
import { setSearchParams } from './stubs/next-navigation';

/**
 * The shot view's visual-comparison tools (#540): one view for both panes, a
 * crop of the board pinned beside the screenshot, and the crop laid on it.
 *
 * The cut itself — fetching the board's export scale, drawing the region into a
 * canvas — needs a browser jsdom does not have, so the hook that makes it is
 * replaced by one that hands back a crop for any rect it is given. What is
 * asserted is the view around it. The tile map is a stub each test sets: none
 * by default, so the board opens whole unless a test hands it a tier board's tiles.
 */

const tileMap = vi.hoisted(() => ({ tiles: null as Record<string, number[]> | null }));

vi.mock('../hooks/useBoardCrop', () => ({
  useBoardTiles: () => tileMap.tiles,
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

const SET = 'main-2026-10-16';
const KEY = 'atoms__desktop__light__atoms-badge--accent';
const AT = `/set/${SET}/shot/${KEY}`;

const replaceState = vi.fn<History['replaceState']>();

function shotView() {
  return (
    <ShotView
      label={SET}
      story="Badge — Accent"
      storyId="atoms-badge--accent"
      viewport="desktop"
      theme="light"
      tier="atoms"
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
    />
  );
}

function renderView(query = '') {
  setSearchParams(query);

  return render(shotView());
}

const pressed = (name: string) =>
  screen.getByRole('button', { name }).getAttribute('aria-pressed');
const viewGroup = () => screen.getByRole('group', { name: 'view' });
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

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
  tileMap.tiles = null;
});

describe('the shot view’s layout', () => {
  it('opens side by side, with the overlay offered beside it', () => {
    renderView();

    const options = within(viewGroup()).getAllByRole('button');
    expect(
      options.map((option) => [option.textContent, option.getAttribute('aria-pressed')]),
    ).toEqual([
      ['side by side', 'true'],
      ['overlay', 'false'],
    ]);
  });

  it('holds both panes to one view until the sync is released', () => {
    renderView();
    const before = pressed('zoom and pan both panes together');

    press('zoom and pan both panes together');

    expect([before, pressed('zoom and pan both panes together')]).toEqual([
      'true',
      'false',
    ]);
  });

  it('starts the sync afresh when it is turned back on', () => {
    renderView();

    press('zoom and pan both panes together');
    press('zoom and pan both panes together');

    expect(pressed('zoom and pan both panes together')).toBe('true');
  });

  it('offers a crop toggle on the board’s zoom row', () => {
    renderView();

    press('crop the board');

    expect(pressed('crop the board')).toBe('true');
  });
});

describe('the shot view’s crop', () => {
  it('pins the crop the address carries, and says what it is', () => {
    renderView('crop=325,487,130,65');

    expect({
      label: screen.getByText('crop · atoms') !== null,
      alt: screen.getByRole('img', { name: 'a crop of the atoms design board' }) !== null,
    }).toEqual({ label: true, alt: true });
  });

  // Regression, 18 Oct 2026: once a crop was pinned the crop toggle left the
  // zoom row, so a reader could not refine the region — only clear it.
  it('keeps the crop toggle beside a pinned crop, to draw the region again', () => {
    renderView('crop=325,487,130,65');

    press('crop the board');

    expect({
      cleared: replaceState.mock.calls.at(-1)?.[2],
      cropping: pressed('crop the board'),
    }).toEqual({ cleared: `${AT}?crop=`, cropping: 'true' });
  });

  it('clears the crop from the address, back to the whole board', () => {
    renderView('crop=325,487,130,65');

    press('clear the crop');

    // Kept as an empty `crop=`: no crop at all would open on the story's tile.
    expect(replaceState.mock.calls.at(-1)?.[2]).toBe(`${AT}?crop=`);
  });

  // Regression, 18 Oct 2026: the cleared crop's zoom — 416% on a Badge tile —
  // stayed on the shared view, so the whole board opened magnified on a corner.
  it('drops the crop’s zoom with it, so both panes open fitted', () => {
    renderView('crop=325,487,130,65');
    fireEvent.click(screen.getAllByRole('button', { name: 'zoom in' })[0]!);
    const zoomed = screen.queryAllByText('150%').length;

    press('clear the crop');

    expect({ zoomed, after: screen.queryAllByText('150%').length }).toEqual({
      zoomed: 2,
      after: 0,
    });
  });

  it('opens on the story’s tile when the address carries no crop', () => {
    tileMap.tiles = {
      [KEY]: [93, 555, 1823, 37],
      'atoms__desktop__light__atoms-button--primary': [93, 1312, 1823, 58],
    };

    renderView();

    expect(screen.getByText('crop · Badge — Accent tile')).not.toBeNull();
  });

  it('opens on the whole board when the address asks for it with an empty crop', () => {
    tileMap.tiles = { [KEY]: [93, 555, 1823, 37] };

    renderView('crop=');

    expect(screen.queryByRole('button', { name: 'clear the crop' })).toBeNull();
  });

  it('opens on the whole board for a story the board draws no tile for', () => {
    tileMap.tiles = {
      'atoms__desktop__light__atoms-button--primary': [93, 1312, 1823, 58],
    };

    renderView();

    expect(screen.queryByRole('button', { name: 'clear the crop' })).toBeNull();
  });

  // A crop is in one board's pixels: another board has nothing at those pixels.
  it('drops the crop when another board is picked', () => {
    renderView();

    fireEvent.click(
      within(screen.getByRole('group', { name: 'board' })).getByRole('button', {
        name: 'pages',
      }),
    );

    expect(replaceState.mock.calls.at(-1)?.[2]).toBe(`${AT}?board=05-pages`);
  });
});

describe('the shot view’s overlay', () => {
  it('asks for a crop rather than laying a whole board on a shot', () => {
    renderView();

    fireEvent.click(within(viewGroup()).getByRole('button', { name: 'overlay' }));

    expect(screen.getByText(/Crop a region of the board/)).toBeTruthy();
  });

  it('goes back beside the board, ready to crop, when asked', () => {
    renderView();
    fireEvent.click(within(viewGroup()).getByRole('button', { name: 'overlay' }));

    fireEvent.click(screen.getAllByRole('button', { name: 'crop the board' }).at(-1)!);

    expect({
      layout: within(viewGroup())
        .getByRole('button', { name: 'side by side' })
        .getAttribute('aria-pressed'),
      cropping: pressed('crop the board'),
    }).toEqual({ layout: 'true', cropping: 'true' });
  });

  it('lays the crop on the screenshot at half strength', () => {
    const { container } = renderView('crop=0,0,200,100');
    fireEvent.click(within(viewGroup()).getByRole('button', { name: 'overlay' }));

    const crop = container.querySelector<HTMLImageElement>('.vd-overlay__crop');
    expect({
      src: crop?.getAttribute('src'),
      opacity: crop?.style.opacity,
      width: crop?.style.width,
    }).toEqual({
      src: 'blob:crop',
      opacity: '0.5',
      width: '100px',
    });
  });

  it('follows the opacity slider', () => {
    const { container } = renderView('crop=0,0,200,100');
    fireEvent.click(within(viewGroup()).getByRole('button', { name: 'overlay' }));

    fireEvent.change(screen.getByRole('slider', { name: 'board opacity' }), {
      target: { value: '80' },
    });

    expect(
      container.querySelector<HTMLImageElement>('.vd-overlay__crop')?.style.opacity,
    ).toBe('0.8');
  });

  it('nudges the crop with the arrows, and says by how much', () => {
    const { container } = renderView('crop=0,0,200,100');
    fireEvent.click(within(viewGroup()).getByRole('button', { name: 'overlay' }));
    const pane = screen.getByRole('group', {
      name: 'the screenshot with the board crop over it',
    });

    fireEvent.keyDown(pane, { key: 'ArrowRight' });
    fireEvent.keyDown(pane, { key: 'ArrowUp', shiftKey: true });

    expect({
      left: container.querySelector<HTMLImageElement>('.vd-overlay__crop')?.style.left,
      said: screen.getByText(/offset \+1, −10/) !== null,
    }).toEqual({ left: '1px', said: true });
  });

  it('nudges the screenshot instead when the toggle hands it the move', () => {
    const { container } = renderView('crop=0,0,200,100');
    fireEvent.click(within(viewGroup()).getByRole('button', { name: 'overlay' }));
    const moves = screen.getByRole('group', { name: 'moves' });

    fireEvent.click(within(moves).getByRole('button', { name: 'screenshot' }));
    fireEvent.keyDown(
      screen.getByRole('group', { name: 'the screenshot with the board crop over it' }),
      { key: 'ArrowRight' },
    );

    expect({
      shot: container.querySelector<HTMLImageElement>('.vd-overlay__shot')?.style.left,
      crop: container.querySelector<HTMLImageElement>('.vd-overlay__crop')?.style.left,
      pressed: within(moves)
        .getByRole('button', { name: 'screenshot' })
        .getAttribute('aria-pressed'),
    }).toEqual({ shot: '1px', crop: '0px', pressed: 'true' });
  });

  it('nudges with buttons, for a reader with no arrow keys', () => {
    const { container } = renderView('crop=0,0,200,100');
    fireEvent.click(within(viewGroup()).getByRole('button', { name: 'overlay' }));

    fireEvent.click(screen.getByRole('button', { name: 'nudge down' }));
    fireEvent.click(screen.getByRole('button', { name: 'nudge left' }), {
      shiftKey: true,
    });

    expect({
      top: container.querySelector<HTMLImageElement>('.vd-overlay__crop')?.style.top,
      left: container.querySelector<HTMLImageElement>('.vd-overlay__crop')?.style.left,
      said: screen.getByText(/offset −10, \+1/).getAttribute('aria-live'),
    }).toEqual({ top: '1px', left: '-10px', said: 'polite' });
  });

  // Regression, 18 Oct 2026: the grid toggle stayed on the overlay's toolbar,
  // pressed and did nothing — the overlay drew no grid.
  it('lays the grid over the screenshot when the grid is on', () => {
    const { container } = renderView('crop=0,0,200,100');
    fireEvent.click(within(viewGroup()).getByRole('button', { name: 'overlay' }));

    fireEvent.click(screen.getByRole('button', { name: 'grid' }));

    expect({
      drawn: container.querySelector('.vd-overlay .ds-panzoom__grid') !== null,
      said: screen.queryByText('grid 16 px') !== null,
    }).toEqual({ drawn: true, said: true });
  });

  it('lays the crop normally until the difference blend is chosen', () => {
    const { container } = renderView('crop=0,0,200,100');
    fireEvent.click(within(viewGroup()).getByRole('button', { name: 'overlay' }));
    const blend = screen.getByRole('group', { name: 'blend' });
    const crop = () => container.querySelector<HTMLImageElement>('.vd-overlay__crop');
    const before = crop()?.dataset.blend;

    fireEvent.click(within(blend).getByRole('button', { name: 'difference' }));

    expect({
      before,
      after: crop()?.dataset.blend,
      pressed: within(blend)
        .getByRole('button', { name: 'difference' })
        .getAttribute('aria-pressed'),
    }).toEqual({ before: 'normal', after: 'difference', pressed: 'true' });
  });

  it('zooms the shot and the crop together', () => {
    const { container } = renderView('crop=0,0,200,100');
    fireEvent.click(within(viewGroup()).getByRole('button', { name: 'overlay' }));

    fireEvent.click(screen.getByRole('button', { name: 'zoom in' }));

    expect({
      readout: screen.getByText('150%') !== null,
      width: container.querySelector<HTMLImageElement>('.vd-overlay__crop')?.style.width,
    }).toEqual({ readout: true, width: '150px' });
  });
});

describe('the shot view’s keys', () => {
  it('releases the sync on s, lays the crop on o, and crops on c', () => {
    renderView();

    fireEvent.keyDown(document, { key: 's' });
    fireEvent.keyDown(document, { key: 'c' });
    const sync = pressed('zoom and pan both panes together');
    const cropping = pressed('crop the board');
    fireEvent.keyDown(document, { key: 'o' });

    expect({
      sync,
      cropping,
      overlay: within(viewGroup())
        .getByRole('button', { name: 'overlay' })
        .getAttribute('aria-pressed'),
    }).toEqual({ sync: 'false', cropping: 'true', overlay: 'true' });
  });

  it('leaves a letter typed into a field alone', () => {
    renderView('crop=0,0,200,100');
    fireEvent.click(within(viewGroup()).getByRole('button', { name: 'overlay' }));

    fireEvent.keyDown(screen.getByRole('slider', { name: 'board opacity' }), {
      key: 'o',
    });

    expect(
      within(viewGroup())
        .getByRole('button', { name: 'overlay' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('leaves a browser shortcut alone', () => {
    renderView();

    fireEvent.keyDown(document, { key: 's', metaKey: true });

    expect(pressed('zoom and pan both panes together')).toBe('true');
  });
});

// Regression, 18 Oct 2026: switching side by side → overlay at 338% dropped the
// overlay back to 100%. The overlay starts at the step nearest the panes' zoom.
describe('the overlay’s starting zoom', () => {
  it('starts where the synced panes were, on its own steps', () => {
    expect([undefined, 1, 1.5, 2.25, 3.375, 3.4, 50].map(zoomIndexOf)).toEqual([
      0, 0, 1, 2, 3, 3, 5,
    ]);
  });
});

describe('the overlay in the address', () => {
  const crop = (container: HTMLElement) =>
    container.querySelector<HTMLImageElement>('.vd-overlay__crop');

  it('opens a shared overlay as it was left: blend, opacity, nudges and zoom', () => {
    const { container } = renderView(
      'crop=0,0,200,100&view=overlay&blend=difference&opacity=80&offset=-14,-11&shot=2,0&zoom=150',
    );

    expect({
      blend: crop(container)?.dataset.blend,
      opacity: crop(container)?.style.opacity,
      left: crop(container)?.style.left,
      shot: container.querySelector<HTMLImageElement>('.vd-overlay__shot')?.style.left,
      zoom: screen.getByText('150%') !== null,
      said: screen.getByText(/offset −14, −11/) !== null,
    }).toEqual({
      blend: 'difference',
      opacity: '0.8',
      left: '-21px',
      shot: '3px',
      zoom: true,
      said: true,
    });
  });

  it('writes the overlay into the address when it is laid on', () => {
    renderView('crop=0,0,200,100');

    fireEvent.click(within(viewGroup()).getByRole('button', { name: 'overlay' }));

    expect(replaceState.mock.calls.at(-1)?.[2]).toBe(
      `${AT}?crop=0,0,200,100&view=overlay`,
    );
  });

  it('writes each change to the alignment, so the link follows it', () => {
    renderView('crop=0,0,200,100&view=overlay');
    const pane = screen.getByRole('group', {
      name: 'the screenshot with the board crop over it',
    });

    fireEvent.click(
      within(screen.getByRole('group', { name: 'blend' })).getByRole('button', {
        name: 'difference',
      }),
    );
    fireEvent.keyDown(pane, { key: 'ArrowLeft', shiftKey: true });

    expect(replaceState.mock.calls.at(-1)?.[2]).toBe(
      `${AT}?crop=0,0,200,100&view=overlay&blend=difference&offset=-10,0`,
    );
  });

  it('takes the overlay out of the address when the view goes back beside', () => {
    renderView('crop=0,0,200,100&view=overlay&blend=difference');

    fireEvent.click(within(viewGroup()).getByRole('button', { name: 'side by side' }));

    expect(replaceState.mock.calls.at(-1)?.[2]).toBe(`${AT}?crop=0,0,200,100`);
  });

  it('writes nothing on opening a link it can already read', () => {
    renderView('crop=0,0,200,100&view=overlay&blend=difference');

    expect(replaceState).not.toHaveBeenCalled();
  });
});

// Regression, 19 Oct 2026: a link opening on the overlay found the screenshot
// already loaded before hydration, so no load event came and the layers kept no
// size — the crop zoomed to 759% over a screenshot left at 100%.
describe('the overlay opened cold', () => {
  afterEach(() => {
    Reflect.deleteProperty(HTMLImageElement.prototype, 'naturalWidth');
    Reflect.deleteProperty(HTMLImageElement.prototype, 'naturalHeight');
    Reflect.deleteProperty(HTMLImageElement.prototype, 'complete');
  });

  it('sizes the layers from a screenshot that loaded before it could listen', () => {
    for (const [name, value] of [
      ['naturalWidth', 200],
      ['naturalHeight', 25],
      ['complete', true],
    ] as const) {
      Object.defineProperty(HTMLImageElement.prototype, name, {
        configurable: true,
        get: () => value,
      });
    }

    const { container } = renderView('crop=0,0,200,100&view=overlay&zoom=150');

    expect(container.querySelector<HTMLElement>('.vd-overlay__layers')?.style.width).toBe(
      '300px',
    );
  });
});

describe('the overlay’s zoom in the address', () => {
  it('writes the zoom it inherited from the panes, so a link opens at it', () => {
    renderView('crop=0,0,200,100');
    fireEvent.click(screen.getAllByRole('button', { name: 'zoom in' })[0]!);

    fireEvent.click(within(viewGroup()).getByRole('button', { name: 'overlay' }));

    expect(replaceState.mock.calls.at(-1)?.[2]).toBe(
      `${AT}?crop=0,0,200,100&view=overlay&zoom=150`,
    );
  });

  it('forgets its own zoom back beside the board, and starts from the panes again', () => {
    renderView('crop=0,0,200,100&view=overlay&zoom=338');

    fireEvent.click(within(viewGroup()).getByRole('button', { name: 'side by side' }));
    fireEvent.click(within(viewGroup()).getByRole('button', { name: 'overlay' }));

    expect({
      readout: screen.getByText('100%') !== null,
      address: replaceState.mock.calls.at(-1)?.[2],
    }).toEqual({ readout: true, address: `${AT}?crop=0,0,200,100&view=overlay` });
  });

  it('offers no board picker over the overlay, so no pick can drop its alignment', () => {
    renderView('crop=0,0,200,100&view=overlay&blend=difference');

    expect(screen.queryByRole('group', { name: 'board' })).toBeNull();
  });
});

// Regression, 19 Oct 2026: Next keeps a closed shot view mounted but hidden, so
// reopening it from the set on a bare address brought back the overlay, nudged
// and zoomed, under an address that named none of it.
describe('the shot view shown again', () => {
  it('takes the address it came back to, not the overlay it was left on', () => {
    setSearchParams('crop=0,0,200,100&view=overlay&blend=difference&offset=2,0');
    const { container, rerender } = render(
      <Activity mode="visible">{shotView()}</Activity>,
    );
    rerender(<Activity mode="hidden">{shotView()}</Activity>);
    setSearchParams('crop=0,0,200,100');

    rerender(<Activity mode="visible">{shotView()}</Activity>);

    expect({
      overlay: container.querySelector('.vd-overlay'),
      pressed: pressed('side by side'),
    }).toEqual({ overlay: null, pressed: 'true' });
  });
});
