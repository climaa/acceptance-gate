// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import {
  cropParam,
  cssSize,
  nudged,
  nudgeText,
  parseCrop,
  storyTile,
} from '../lib/board-crop';
import { shotViewHref } from '../lib/shots';

describe('parseCrop and cropParam', () => {
  it('reads a crop back from the address', () => {
    expect(parseCrop('325,487,130,65')).toEqual({
      x: 325,
      y: 487,
      width: 130,
      height: 65,
    });
  });

  it('writes a crop the way it reads one', () => {
    expect(cropParam({ x: 1, y: 2, width: 3, height: 4 })).toBe('1,2,3,4');
  });

  it.each([null, '', 'a,b,c,d', '1,2,3', '1,2,0,4', '-1,2,3,4'])(
    'reads %j as no crop',
    (value) => {
      expect(parseCrop(value)).toBeNull();
    },
  );
});

describe('cssSize', () => {
  // A board exported at 2× is two PNG pixels to every design pixel.
  it('reads a crop in CSS pixels at its board’s export scale', () => {
    expect(cssSize({ x: 0, y: 0, width: 200, height: 100 }, 2)).toEqual({
      width: 100,
      height: 50,
    });
  });
});

describe('nudged', () => {
  it('moves one CSS pixel per arrow', () => {
    expect(nudged({ x: 0, y: 0 }, 'ArrowRight', false)).toEqual({ x: 1, y: 0 });
  });

  it('moves ten with Shift', () => {
    expect(nudged({ x: 0, y: 0 }, 'ArrowUp', true)).toEqual({ x: 0, y: -10 });
  });

  it('is nothing for a key that is not an arrow', () => {
    expect(nudged({ x: 0, y: 0 }, 'a', false)).toBeNull();
  });
});

describe('nudgeText', () => {
  it('signs each axis, with a real minus', () => {
    expect(nudgeText({ x: 3, y: -1 })).toBe('+3, −1');
  });
});

describe('shotViewHref with a crop', () => {
  it('carries the crop with its commas as they are', () => {
    expect(shotViewHref('main-2026-10-16', 'k', '05-pages', '1,2,3,4')).toBe(
      '/set/main-2026-10-16/shot/k?board=05-pages&crop=1,2,3,4',
    );
  });
});

describe('storyTile', () => {
  const tiles = {
    'atoms__desktop__light__atoms-badge--accent': [93, 555, 1823, 37],
    'atoms__desktop__dark__atoms-badge--accent': [1986, 555, 1823, 37],
    'atoms__desktop__light__atoms-bucketchip--tones': [93, 1163, 1823, 34],
  } as const;

  it('finds the tile named by the variant’s own key', () => {
    expect(storyTile(tiles, 'atoms__desktop__dark__atoms-badge--accent')).toEqual({
      name: 'Badge — Accent',
      rect: { x: 1986, y: 555, width: 1823, height: 37 },
    });
  });

  // The loose match this replaced opened every Badge story on one Badge tile.
  it('does not stand one story’s tile in for another story of its component', () => {
    expect(storyTile(tiles, 'atoms__desktop__light__atoms-badge--danger')).toBeNull();
  });

  it('is null for a variant the board draws no tile for', () => {
    expect(
      storyTile(tiles, 'organisms__desktop__light__organisms-dialog--open'),
    ).toBeNull();
  });

  it('is null for a key that names something every object has', () => {
    expect(storyTile(tiles, 'constructor')).toBeNull();
  });
});

describe('shotViewHref with an empty crop', () => {
  it('keeps it, as the reader asking for the whole board', () => {
    expect(shotViewHref('main-2026-10-16', 'k', null, '')).toBe(
      '/set/main-2026-10-16/shot/k?crop=',
    );
  });
});
