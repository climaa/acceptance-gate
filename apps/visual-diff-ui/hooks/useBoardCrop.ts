'use client';

import { useEffect, useState } from 'react';
import type { PanZoomRect } from '@gate/ui';
import { z } from 'zod';
import { cssSize } from '@/lib/board-crop';
import { type DesignBoard, designBoardScaleUrl, designBoardUrl } from '@/lib/comparison';
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

export interface BoardCrop {
  url: string;
  /** In CSS pixels: the size it is laid over a screenshot at. */
  width: number;
  height: number;
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

/** The region of a loaded board, redrawn at CSS size, as a PNG blob. */
async function cutBoard(
  board: HTMLImageElement,
  rect: PanZoomRect,
  scale: number,
): Promise<Blob | null> {
  const size = cssSize(rect, scale);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(size.width);
  canvas.height = Math.round(size.height);
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
    canvas.width,
    canvas.height,
  );

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
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
): BoardCrop | null {
  const scale = useBoardScale(board);
  const [crop, setCrop] = useState<(BoardCrop & { key: string }) | null>(null);
  const key =
    rect && scale
      ? `${board}|${rect.x},${rect.y},${rect.width},${rect.height}|${scale}`
      : null;

  useEffect(() => {
    if (!rect || !scale || key === null) return;
    const current = key;

    let live = true;
    let url: string | null = null;
    void (async () => {
      try {
        const blob = await cutBoard(await loadBoard(board), rect, scale);
        if (!live || !blob) return;

        url = URL.createObjectURL(blob);
        setCrop({ key: current, url, ...cssSize(rect, scale) });
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

  return { url: crop.url, width: crop.width, height: crop.height };
}
