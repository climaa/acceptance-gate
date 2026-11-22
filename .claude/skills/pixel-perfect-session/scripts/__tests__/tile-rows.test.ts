import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

// @ts-expect-error — plain .mjs with JSDoc types, no declaration file.
import * as rows from '../tile-rows.mjs';

const {
  classifyRow,
  cropToDesignPixels,
  formatRun,
  globalsOf,
  inkColumns,
  parseArgs,
  parseKey,
  parseTarget,
  rowRuns,
  sourceSpan,
} = rows;

type Rgb = [number, number, number];

/** A small in-memory image, every pixel painted by `paint`. */
function image(width: number, height: number, paint: (x: number, y: number) => Rgb) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      [data[o], data[o + 1], data[o + 2]] = paint(x, y);
      data[o + 3] = 255;
    }
  }
  return { width, height, data };
}

const GROUND: Rgb = [250, 250, 250];
const INK: Rgb = [20, 20, 20];
const WASH: Rgb = [250, 230, 210];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseTarget', () => {
  it('reads a bare variant key from the committed baselines', () => {
    // Act
    const target = parseTarget('atoms__desktop__light__atoms-badge--accent');

    // Assert
    expect(target).toEqual({
      key: 'atoms__desktop__light__atoms-badge--accent',
      label: 'baselines',
    });
  });

  it('reads the set, the key and the console from a shot view URL', () => {
    // Act
    const target = parseTarget(
      'http://127.0.0.1:3300/set/v1.9.0/shot/atoms__desktop__dark__atoms-badge--accent?view=overlay',
    );

    // Assert
    expect(target).toEqual({
      origin: 'http://127.0.0.1:3300',
      label: 'v1.9.0',
      key: 'atoms__desktop__dark__atoms-badge--accent',
    });
  });

  it('refuses a console URL that is not a shot view', () => {
    // Act
    const read = () => parseTarget('http://127.0.0.1:3300/report/abc');

    // Assert
    expect(read).toThrow(/is not a shot view/);
  });
});

describe('parseKey', () => {
  it('splits a four-part key', () => {
    // Act
    const variant = parseKey('atoms__mobile__dark__atoms-badge--accent');

    // Assert
    expect(variant).toEqual({
      tier: 'atoms',
      viewport: 'mobile',
      theme: 'dark',
      storyId: 'atoms-badge--accent',
    });
  });

  it('reads a locale between the theme and the story id', () => {
    // Act
    const variant = parseKey('atoms__desktop__light__es__atoms-badge--accent');

    // Assert
    expect(variant).toMatchObject({ locale: 'es', storyId: 'atoms-badge--accent' });
  });

  it('refuses anything else', () => {
    // Act
    const read = () => parseKey('atoms__desktop');

    // Assert
    expect(read).toThrow(/is not a variant key/);
  });
});

describe('parseArgs', () => {
  it('reads every flag, resolving files and trimming the origin', () => {
    // Act
    const args = parseArgs('atoms__desktop__light__atoms-badge--accent', [
      '--png',
      'shot.png',
      '--storybook',
      'http://localhost:6007/',
      '--save',
      'out',
    ]);

    // Assert
    expect(args).toEqual({
      target: { key: 'atoms__desktop__light__atoms-badge--accent', label: 'baselines' },
      png: resolve('shot.png'),
      storybook: 'http://localhost:6007',
      save: resolve('out'),
    });
  });

  it('defaults to the local Storybook and no file', () => {
    // Act
    const args = parseArgs('atoms__desktop__light__atoms-badge--accent', []);

    // Assert
    expect(args).toMatchObject({
      png: undefined,
      storybook: 'http://localhost:6006',
      save: undefined,
    });
  });

  it.each([
    [['--png'], '--png needs a value'],
    [['--png', '--save'], '--png needs a value'],
    [['--size', '3'], 'unknown flag --size'],
  ])('exits 2 with the usage for %j', (rest, why) => {
    // Arrange
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit ${code}`);
    });

    // Act
    const read = () => parseArgs('atoms__desktop__light__atoms-badge--accent', rest);

    // Assert
    expect(read).toThrow('exit 2');
    expect(String(stderr.mock.calls[0]?.[0])).toContain(why);
    expect(String(stderr.mock.calls[0]?.[0])).toContain('usage: tile-rows.mjs');
  });
});

describe('globalsOf', () => {
  it('names the theme, and the locale only for a story listed for it', () => {
    // Act
    const plain = globalsOf({ theme: 'dark' });
    const localised = globalsOf({ theme: 'light', locale: 'es' });

    // Assert
    expect(plain).toMatch(/:dark$/);
    expect(plain).not.toContain(';');
    expect(localised.split(';')).toHaveLength(2);
    expect(localised).toMatch(/:es$/);
  });
});

describe('sourceSpan', () => {
  it('covers the export pixels one design pixel spans', () => {
    // Act
    const span = sourceSpan(4, 2, [0, 99]);

    // Assert
    expect(span).toEqual([4, 6]);
  });

  it('keeps an edge cell inside the inset, so it reads its inner neighbour', () => {
    // Act
    const first = sourceSpan(0, 2, [1, 6]);
    const last = sourceSpan(6, 2, [1, 6]);

    // Assert
    expect(first).toEqual([1, 2]);
    expect(last).toEqual([6, 7]);
  });
});

describe('cropToDesignPixels', () => {
  it('box-averages the tile from the export scale down to 1:1', () => {
    // Arrange: a 4×4 tile at @2, left half black, right half white.
    const board = image(4, 4, (x) => (x < 2 ? [0, 0, 0] : [255, 255, 255]));

    // Act
    const tile = cropToDesignPixels(board, [0, 0, 4, 4], 2);

    // Assert
    expect([tile.width, tile.height]).toEqual([2, 2]);
    expect(Array.from(tile.data.slice(0, 4))).toEqual([0, 0, 0, 255]);
    expect(Array.from(tile.data.slice(4, 8))).toEqual([255, 255, 255, 255]);
  });

  it('skips the blended seam the board draws around the tile', () => {
    // Arrange: a grey tile at @1 whose outermost ring is the neighbour's red.
    const board = image(6, 6, (x, y) =>
      x === 0 || y === 0 || x === 5 || y === 5 ? [255, 0, 0] : [128, 128, 128],
    );

    // Act
    const tile = cropToDesignPixels(board, [0, 0, 6, 6], 1);

    // Assert
    expect(Array.from(tile.data.slice(0, 3))).toEqual([128, 128, 128]);
  });
});

describe('row reading', () => {
  // 10 wide: plain rows 0–1, ink rows 2–3 (columns 3–6), a wash band 4–5, plain 6.
  const shot = image(10, 7, (x, y) => {
    if ((y === 2 || y === 3) && x >= 3 && x <= 6) return INK;
    if (y === 4 || y === 5) return WASH;
    return GROUND;
  });
  const groundSum = GROUND[0] + GROUND[1] + GROUND[2];

  it('classifies a row as ink, tint or plain', () => {
    // Act
    const kinds = [0, 2, 4].map((y) => classifyRow(shot, y, groundSum));

    // Assert
    expect(kinds).toEqual(['plain', 'ink', 'tint']);
  });

  it('reads a dot of colour as plain, not as a band', () => {
    // Arrange
    const dot = image(10, 1, (x) => (x === 0 ? WASH : GROUND));

    // Act
    const kind = classifyRow(dot, 0, groundSum);

    // Assert
    expect(kind).toBe('plain');
  });

  it('joins neighbouring rows of one kind into runs', () => {
    // Act
    const runs = rowRuns(shot);

    // Assert
    expect(runs).toEqual([
      { kind: 'plain', from: 0, to: 1 },
      { kind: 'ink', from: 2, to: 3 },
      { kind: 'tint', from: 4, to: 5 },
      { kind: 'plain', from: 6, to: 6 },
    ]);
  });

  it('gives an ink run its first and last inked column', () => {
    // Act
    const columns = inkColumns(shot, { kind: 'ink', from: 2, to: 3 });

    // Assert
    expect(columns).toEqual([3, 6]);
  });

  it('gives a run with no ink no columns', () => {
    // Act
    const columns = inkColumns(shot, { kind: 'plain', from: 0, to: 1 });

    // Assert
    expect(columns).toBeNull();
  });

  it('prints a run as kind, span and height', () => {
    // Act
    const line = formatRun({ kind: 'ink', from: 2, to: 3 });

    // Assert
    expect(line).toBe('ink      2–3    (2)');
  });
});
