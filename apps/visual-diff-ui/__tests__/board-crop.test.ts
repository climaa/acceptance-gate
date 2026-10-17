// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import { cropParam, cssSize, nudged, nudgeText, parseCrop } from '../lib/board-crop';

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
