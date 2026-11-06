import { describe, expect, it } from 'vitest';

// @ts-expect-error — plain .mjs with JSDoc types, no declaration file.
import * as tileDiff from '../pen/tile-diff.mjs';

const { defaultOut, diffGraph, meanBrightness, sharedSize } = tileDiff;

describe('sharedSize', () => {
  it('takes the smaller side of each axis, so a taller screenshot is cropped', () => {
    // Arrange
    const tile = { width: 1280, height: 4707 };
    const screenshot = { width: 1248, height: 4709 };

    // Act
    const shared = sharedSize(tile, screenshot);

    // Assert
    expect(shared).toEqual({ width: 1248, height: 4707 });
  });
});

describe('diffGraph', () => {
  it('crops both inputs to one size, which blend refuses to work without', () => {
    // Arrange
    const size = { width: 390, height: 844 };

    // Act
    const graph = diffGraph(size);

    // Assert
    expect(graph.match(/crop=390:844:0:0/g)).toHaveLength(2);
    expect(graph).toContain('blend=all_mode=difference');
  });
});

describe('meanBrightness', () => {
  it('reads the mean out of the metadata ffmpeg prints', () => {
    // Arrange
    const text = 'frame:0\nlavfi.signalstats.YMIN=0\nlavfi.signalstats.YAVG=2.96523\n';

    // Act
    const mean = meanBrightness(text);

    // Assert
    expect(mean).toBe(2.96523);
  });

  it('says it found nothing rather than reporting a perfect zero', () => {
    // Arrange
    const text = 'frame:0\n';

    // Act
    const mean = meanBrightness(text);

    // Assert
    expect(mean).toBeNull();
  });
});

describe('defaultOut', () => {
  it('writes beside the tile, so the tile itself is never overwritten', () => {
    // Arrange
    const tile = '/tmp/tiles/home.png';

    // Act
    const out = defaultOut(tile);

    // Assert
    expect(out).toBe('/tmp/tiles/home.diff.png');
  });
});
