'use client';

import { useEffect, useState } from 'react';
import type { PanZoomRect } from '@gate/ui';
import { z } from 'zod';
import { type BoardTiles, cssSize } from '@/lib/board-crop';
import type { DesignBoard } from '@/lib/comparison';
import {
  designBoardScaleUrl,
  designBoardTilesUrl,
  designBoardUrl,
} from '@/lib/design-urls';
import { useJsonOnMount } from './useJsonOnMount';

/**
 * A crop of a design board as an image of its own, in CSS pixels — what the
 * shot view pins beside a screenshot and lays over it.
 *
 * Cut in the browser from the board the page already serves: a canvas the size
 * of the crop in CSS pixels, the board's region drawn into it, and an object URL
 * of the result, revoked when the crop changes or the view closes. Nothing is
 * uploaded and nothing is cached on a server.
 *
 * Null until both the board's export scale and the cut are in hand, and null for
 * good when either cannot be had — a board with no sidecar, an image that will
 * not decode — so the caller falls back to the whole board rather than a guess.
 */

const SidecarSchema = z.object({ scale: z.number().positive() });

const TilesSchema = z.object({
  tiles: z.record(
    z.string(),
    z.tuple([z.number(), z.number(), z.number().positive(), z.number().positive()]),
  ),
});

export interface BoardCrop {
  url: string;
  /** In CSS pixels: the size it is laid over a screenshot at. */
  width: number;
  height: number;
  /** The cropped region inside that frame, from its top-left, in CSS pixels —
   *  the frame is as wide as the screenshot, the region usually far narrower. */
  region: { width: number; height: number };
}

/** The board's PNG pixels per design pixel, or null until it is known. */
function useBoardScale(board: DesignBoard): number | null {
  return useJsonOnMount(
    designBoardScaleUrl(board),
    (body) => SidecarSchema.parse(body).scale,
    {
      initial: null,
      unreachable: null,
    },
  );
}

/** The board's tiles, or null until they are known and for good on a board with
 *  no tile map — every board but the four tier boards. */
export function useBoardTiles(board: DesignBoard): BoardTiles | null {
  return useJsonOnMount(
    designBoardTilesUrl(board),
    (body) => TilesSchema.parse(body).tiles,
    { initial: null, unreachable: null },
  );
}

/** The most a cut is drawn at, in CSS pixels: past it a crop is a board, not a
 *  region of one, and a canvas that size is memory, not a view. An area, not a
 *  side, because a screen's tile is a page — 390 wide and 4141 tall for the
 *  console's mobile dashboard — and a side limit of 4096 refused it, so the shot
 *  view fell back to the whole board. The side limit stays, at the size every
 *  engine draws a canvas side at. */
const MAX_CUT_AREA = 4096 * 4096;
const MAX_CUT_SIDE = 16_384;

/** A crop held to the board it is a crop of: an address can carry any numbers,
 *  and a box past the board's edges is pixels that do not exist. */
function withinBoard(rect: PanZoomRect, board: HTMLImageElement): PanZoomRect | null {
  const x = Math.min(rect.x, board.naturalWidth);
  const y = Math.min(rect.y, board.naturalHeight);
  const width = Math.min(rect.width, board.naturalWidth - x);
  const height = Math.min(rect.height, board.naturalHeight - y);

  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

/**
 * The region of a loaded board, redrawn at CSS size at the top-left of a frame
 * as wide as the screenshot it is read beside.
 *
 * The frame is what makes the two panes comparable. PanZoom fits an image to
 * its pane and never stretches one past its own pixels, so a 72px crop beside a
 * 1248px screenshot sat at 1:1 while the screenshot was shrunk to fit, and could
 * not be zoomed at all — the synced panes moved at two different scales. Cut
 * into a frame of the screenshot's width, both images are the same width, fit
 * at the same scale, zoom to the same cap, and one view shows the same CSS
 * pixels in each.
 */
async function cutBoard(
  board: HTMLImageElement,
  asked: PanZoomRect,
  scale: number,
  frameWidth: number,
): Promise<{
  blob: Blob | null;
  width: number;
  height: number;
  region: { width: number; height: number };
} | null> {
  const rect = withinBoard(asked, board);
  if (!rect) return null;

  const size = cssSize(rect, scale);
  const width = Math.round(Math.max(size.width, frameWidth));
  const height = Math.round(size.height);
  const tooBig =
    width > MAX_CUT_SIDE || height > MAX_CUT_SIDE || width * height > MAX_CUT_AREA;
  if (tooBig) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.drawImage(
    board,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    Math.round(size.width),
    height,
  );
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  );

  return { blob, width, height, region: { width: Math.round(size.width), height } };
}

/** A board's image, decoded. */
function loadBoard(board: DesignBoard): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = designBoardUrl(board);
  });
}

export function useBoardCrop(
  board: DesignBoard,
  rect: PanZoomRect | null,
  /** The screenshot's width in CSS pixels, which the cut is framed to; 0 when
   *  it is not known, and the cut is then only as wide as the crop. */
  frameWidth = 0,
): BoardCrop | null {
  const scale = useBoardScale(board);
  const [crop, setCrop] = useState<(BoardCrop & { key: string }) | null>(null);
  const key =
    rect && scale
      ? `${board}|${rect.x},${rect.y},${rect.width},${rect.height}|${scale}|${frameWidth}`
      : null;

  useEffect(() => {
    if (!rect || !scale || key === null) return;
    const current = key;

    let live = true;
    let url: string | null = null;
    void (async () => {
      try {
        const image = await loadBoard(board);
        const cut = await cutBoard(image, rect, scale, frameWidth);
        if (!live || !cut?.blob) return;

        url = URL.createObjectURL(cut.blob);
        setCrop({
          key: current,
          url,
          width: cut.width,
          height: cut.height,
          region: cut.region,
        });
      } catch {
        if (live) setCrop(null);
      }
    })();

    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
    // `key` is the crop's identity; the rect object is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Only the cut made for this crop: a previous one's URL is revoked the moment
  // the crop changes, and showing it would be a broken image.
  if (key === null || crop?.key !== key) return null;

  return { url: crop.url, width: crop.width, height: crop.height, region: crop.region };
}
