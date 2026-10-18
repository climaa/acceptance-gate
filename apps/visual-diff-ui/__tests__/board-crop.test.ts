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
    expect(shotViewHref('main-2026-10-16', 'k', 'pages', '1,2,3,4')).toBe(
      '/set/main-2026-10-16/shot/k?board=pages&crop=1,2,3,4',
    );
  });
});

describe('storyTile', () => {
  const tiles = {
    Badge: [476, 528, 384, 148],
    BucketChip: [71, 5599, 327, 251],
    PanZoom: [420, 6958, 327, 755],
  } as const;

  it('finds the tile a story’s component is drawn in, whatever the story', () => {
    expect(storyTile(tiles, 'atoms__desktop__light__atoms-badge--accent')).toEqual({
      name: 'Badge',
      rect: { x: 476, y: 528, width: 384, height: 148 },
    });
  });

  it('matches a component whose id Storybook writes without its capitals', () => {
    expect(storyTile(tiles, 'atoms__mobile__dark__atoms-bucketchip--changed')?.name).toBe(
      'BucketChip',
    );
  });

  it('is null for a story the board draws no tile for', () => {
    expect(
      storyTile(tiles, 'organisms__desktop__light__organisms-dialog--open'),
    ).toBeNull();
  });
});

describe('shotViewHref with an empty crop', () => {
  it('keeps it, as the reader asking for the whole board', () => {
    expect(shotViewHref('main-2026-10-16', 'k', null, '')).toBe(
      '/set/main-2026-10-16/shot/k?crop=',
    );
  });
});
