// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShotView } from '../components/ShotView';
import { setSearchParams } from './stubs/next-navigation';

/**
 * The shot view's visual-comparison tools (#540): one view for both panes, a
 * crop of the board pinned beside the screenshot, and the crop laid on it.
 *
 * The cut itself — fetching the board's export scale, drawing the region into a
 * canvas — needs a browser jsdom does not have, so the hook that makes it is
 * replaced by one that hands back a crop for any rect it is given. What is
 * asserted is the view around it.
 */

vi.mock('../hooks/useBoardCrop', () => ({
  useBoardCrop: (_board: string, rect: { width: number; height: number } | null) =>
    rect ? { url: 'blob:crop', width: rect.width / 2, height: rect.height / 2 } : null,
}));

const SET = 'main-2026-10-16';
const KEY = 'atoms__desktop__light__atoms-badge--accent';
const AT = `/set/${SET}/shot/${KEY}`;

const replaceState = vi.fn<History['replaceState']>();

function renderView(query = '') {
  setSearchParams(query);

  return render(
    <ShotView
      label={SET}
      title={`Badge — Accent · desktop/light · ${SET}`}
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
    />,
  );
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
      label: screen.getByText('crop · components') !== null,
      alt:
        screen.getByRole('img', { name: 'a crop of the components design board' }) !==
        null,
    }).toEqual({ label: true, alt: true });
  });

  it('clears the crop from the address, back to the whole board', () => {
    renderView('crop=325,487,130,65');

    press('clear the crop');

    expect(replaceState.mock.calls.at(-1)?.[2]).toBe(AT);
  });

  // A crop is in one board's pixels: another board has nothing at those pixels.
  it('drops the crop when another board is picked', () => {
    renderView();

    fireEvent.click(
      within(screen.getByRole('group', { name: 'board' })).getByRole('button', {
        name: 'pages',
      }),
    );

    expect(replaceState.mock.calls.at(-1)?.[2]).toBe(`${AT}?board=pages`);
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
