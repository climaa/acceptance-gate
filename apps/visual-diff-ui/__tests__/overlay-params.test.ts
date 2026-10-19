import { describe, expect, it } from 'vitest';
import {
  asksOverlay,
  OVERLAY_DEFAULTS,
  overlayQuery,
  parseOverlay,
} from '../lib/overlay-params';
import { shotViewHref } from '../lib/shots';

/**
 * The overlay as the address carries it: what a link reproduces, and what it
 * leaves out so an untouched view keeps a bare link.
 */

const read = (query: string) => parseOverlay(new URLSearchParams(query));

describe('the overlay’s address', () => {
  it('reads every value a shared link carries', () => {
    const query =
      'view=overlay&blend=difference&opacity=60&offset=-14,-11&shot=2,0&zoom=759';

    const parsed = read(query);

    expect({ overlay: asksOverlay(new URLSearchParams(query)), parsed }).toEqual({
      overlay: true,
      parsed: {
        blend: 'difference',
        opacity: 60,
        board: { x: -14, y: -11 },
        shot: { x: 2, y: 0 },
        zoomAt: 5,
      },
    });
  });

  it('reads a value it cannot make sense of as its default', () => {
    const parsed = read('blend=multiply&opacity=half&offset=1,2,3&shot=x,1&zoom=big');

    expect(parsed).toEqual(OVERLAY_DEFAULTS);
  });

  it('reads a nudge past the bound as no nudge, not a layer a scroll away', () => {
    const [far, edge] = ['offset=99999999999999999999999,1', 'offset=-10000,10000'].map(
      (q) => read(q).board,
    );

    expect({ far, edge }).toEqual({ far: { x: 0, y: 0 }, edge: { x: -10000, y: 10000 } });
  });

  it('holds an opacity past either end to the end it passed', () => {
    const [low, high] = ['opacity=-5', 'opacity=250'].map((q) => read(q).opacity);

    expect({ low, high }).toEqual({ low: 0, high: 100 });
  });

  it('writes nothing while the view is side by side', () => {
    const query = overlayQuery(false, { ...OVERLAY_DEFAULTS, blend: 'difference' });

    expect(query).toBe('');
  });

  it('writes an untouched overlay as the one word that asks for it', () => {
    const query = overlayQuery(true, OVERLAY_DEFAULTS);

    expect(query).toBe('view=overlay');
  });

  it('writes what was changed, commas as they are, and reads it back the same', () => {
    const at = {
      blend: 'difference' as const,
      opacity: 60,
      board: { x: -14, y: -11 },
      shot: { x: 2, y: 0 },
      zoomAt: 5,
    };

    const query = overlayQuery(true, at);

    expect({ query, back: read(query) }).toEqual({
      query: 'view=overlay&blend=difference&opacity=60&offset=-14,-11&shot=2,0&zoom=759',
      back: at,
    });
  });

  it('follows the board and the crop in a shot view’s link', () => {
    const href = shotViewHref('s', 'k', 'pages', '1,2,3,4', 'view=overlay');

    expect(href).toBe('/set/s/shot/k?board=pages&crop=1,2,3,4&view=overlay');
  });
});
