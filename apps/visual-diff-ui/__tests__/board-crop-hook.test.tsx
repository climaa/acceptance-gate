// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanZoomRect } from '@gate/ui';
import { useBoardCrop } from '../hooks/useBoardCrop';

/**
 * The cut behind a pinned crop: the board's export scale, read off its sidecar,
 * and the region redrawn at CSS size into a canvas.
 *
 * jsdom has no image decoding and no canvas, so both are stood in for at the
 * browser's own seams — `Image`, `getContext`, `toBlob`, `createObjectURL` —
 * and what is asserted is what the hook asks of them and hands back.
 */

const drawImage = vi.fn();
const revoked: string[] = [];

/** An Image that "loads" as soon as it is given a source, or fails to. */
function imageThat(loads: boolean) {
  return class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 2000;
    naturalHeight = 1000;
    set src(_value: string) {
      queueMicrotask(() => (loads ? this.onload?.() : this.onerror?.()));
    }
  };
}

function Probe({ rect }: { rect: PanZoomRect | null }) {
  const crop = useBoardCrop('component-library', rect);

  return <p>{crop ? `${crop.url} ${crop.width}×${crop.height}` : 'no crop'}</p>;
}

const RECT = { x: 10, y: 20, width: 200, height: 100 };

async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ scale: 2 }), { status: 200 })),
  );
  vi.stubGlobal('Image', imageThat(true));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ({ drawImage }) as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback) {
    callback(new Blob(['png']));
  });
  URL.createObjectURL = vi.fn(() => 'blob:crop');
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  drawImage.mockReset();
  revoked.length = 0;
});

describe('useBoardCrop', () => {
  it('is nothing without a crop to cut', async () => {
    render(<Probe rect={null} />);
    await settle();

    expect(screen.getByText('no crop')).toBeTruthy();
  });

  // A board exported at 2× is two PNG pixels per CSS pixel.
  it('cuts the region at CSS size, at its board’s export scale', async () => {
    render(<Probe rect={RECT} />);
    await settle();

    expect({
      shown: screen.getByText('blob:crop 100×50') !== null,
      drawn: drawImage.mock.calls[0]?.slice(1),
    }).toEqual({ shown: true, drawn: [10, 20, 200, 100, 0, 0, 100, 50] });
  });

  it('lets the cut go when the crop changes', async () => {
    const { rerender } = render(<Probe rect={RECT} />);
    await settle();

    rerender(<Probe rect={{ ...RECT, x: 11 }} />);
    await settle();

    expect(revoked).toEqual(['blob:crop']);
  });

  it('is nothing for a board whose image will not decode', async () => {
    vi.stubGlobal('Image', imageThat(false));
    render(<Probe rect={RECT} />);
    await settle();

    expect(screen.getByText('no crop')).toBeTruthy();
  });

  it('is nothing for a board with no sidecar to say its scale', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 404 })),
    );
    render(<Probe rect={RECT} />);
    await settle();

    expect(screen.getByText('no crop')).toBeTruthy();
  });

  it('is nothing where the browser will not draw', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    render(<Probe rect={RECT} />);
    await settle();

    expect(screen.getByText('no crop')).toBeTruthy();
  });

  // An address can carry any numbers: a box past the board is held to it.
  it('holds a crop to the board it is a crop of', async () => {
    render(<Probe rect={{ x: 1900, y: 900, width: 400, height: 400 }} />);
    await settle();

    expect(drawImage.mock.calls[0]?.slice(1)).toEqual([
      1900, 900, 100, 100, 0, 0, 50, 50,
    ]);
  });

  it('cuts nothing for a crop wholly off the board', async () => {
    render(<Probe rect={{ x: 5000, y: 0, width: 10, height: 10 }} />);
    await settle();

    expect({
      drawn: drawImage.mock.calls.length,
      shown: screen.getByText('no crop') !== null,
    }).toEqual({
      drawn: 0,
      shown: true,
    });
  });

  it('cuts nothing larger than a region, however large the board', async () => {
    vi.stubGlobal(
      'Image',
      class extends imageThat(true) {
        naturalWidth = 100_000;
        naturalHeight = 100_000;
      },
    );
    render(<Probe rect={{ x: 0, y: 0, width: 90_000, height: 10 }} />);
    await settle();

    expect(drawImage).not.toHaveBeenCalled();
  });
});
