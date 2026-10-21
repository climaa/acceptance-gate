'use client';

import { useEffect, useRef } from 'react';
import type { Tier } from '@gate/visual-diff/policy';
import {
  type BoardHomes,
  defaultBoard,
  type DesignBoard,
  isDesignBoard,
} from '@/lib/comparison';
import { type AddressParams, asksOverlay } from '@/lib/overlay-params';
import { shotViewHref } from '@/lib/shots';
import { useOverlayAlignment } from './useOverlayAlignment';
import { useReshow } from './useReshow';
import { useShotTools } from './useShotTools';

/**
 * Everything the shot view keeps in its address, in one place: the board, the
 * crop, the view and the overlay's alignment — what a link reproduces.
 *
 * The board and the crop are read off the address on every render and written
 * the moment they change. The view and the alignment are held as state, read
 * from the address the view opened on, and written back as they change
 * (`useReplaceAddress`). Reopened from the set, a view Next kept mounted takes
 * the address it came back to (hooks/useReshow.ts).
 */
export function useShotAddress({
  label,
  shotKey,
  frameWidth,
  tier,
  homes,
  params,
}: {
  label: string;
  shotKey: string;
  frameWidth: number;
  tier: Tier;
  homes: BoardHomes;
  params: AddressParams;
}) {
  const asked = params.get('board');
  const home = defaultBoard({ tier, key: shotKey }, homes);
  const board = isDesignBoard(asked) ? asked : home;
  // A board equal to the one the tile is drawn on is not a choice worth recording.
  const boardParam = (picked: DesignBoard) => (picked === home ? null : picked);
  // Called from handlers, after `overlay` below exists.
  const write = (picked: DesignBoard, crop: string | null) =>
    window.history.replaceState(
      null,
      '',
      shotViewHref(label, shotKey, boardParam(picked), crop, overlay.query),
    );
  const tools = useShotTools({
    board,
    frameWidth,
    story: shotKey,
    asked: params.get('crop'),
    onCropParam: (crop) => write(board, crop),
    overlayAsked: asksOverlay(params),
  });
  // The zoom the overlay starts from when the address names none.
  const paneZoom = tools.tools.sync ? tools.tools.view?.zoom : undefined;
  const overlay = useOverlayAlignment(params, tools.layout === 'overlay', paneZoom);
  useReshow(() => {
    overlay.reset();
    tools.onLayout(asksOverlay(params) ? 'overlay' : 'side by side');
  });
  useReplaceAddress(
    shotViewHref(label, shotKey, boardParam(board), params.get('crop'), overlay.query),
  );

  return {
    board,
    // A crop is in one board's pixels, so another board drops it.
    pickBoard: (next: DesignBoard) => write(next, null),
    tools,
    paneZoom,
    overlay,
  };
}

/**
 * Writes the view's address whenever it changes after the first render.
 * `replaceState`, as the crop is written: an arrow key nudges a pixel, which is
 * no history entry and no navigation, and `useSearchParams` follows it all the
 * same.
 */
function useReplaceAddress(href: string) {
  const written = useRef(href);
  useEffect(() => {
    if (written.current === href) return;

    written.current = href;
    window.history.replaceState(null, '', href);
  }, [href]);
}
