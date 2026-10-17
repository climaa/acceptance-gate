'use client';

import { useEffect, useState } from 'react';
import type { PanZoomRect, PanZoomView } from '@gate/ui';
import { cropParam, parseCrop } from '@/lib/board-crop';
import type { DesignBoard } from '@/lib/comparison';
import type { ShotTools } from '@/components/DesignStage';
import { useBoardCrop } from './useBoardCrop';

/**
 * The shot view's visual-comparison state (#540): whether the panes hold one
 * view, whether a drag on the board draws a crop, the crop itself, and whether
 * the board is beside the screenshot or laid on it.
 *
 * The crop is the one part in the address — `?crop=x,y,w,h`, in the board's own
 * pixels — because it is a thing to point someone at: a link reproduces exactly
 * the region that was compared. Sync, cropping and the view are ways of looking,
 * held here, as the modal's split and grid are.
 */

export type ShotLayout = 'side by side' | 'overlay';

export const SHOT_LAYOUTS: readonly ShotLayout[] = ['side by side', 'overlay'];

interface ShotToolsInput {
  board: DesignBoard;
  /** The crop the address carries, as it carries it. */
  asked: string | null;
  /** Writes the address with a new crop, or none. */
  onCropParam: (crop: string | null) => void;
}

/** A key the view answers to, unless the reader is typing or reaching for a
 *  browser shortcut. */
function shortcut(event: KeyboardEvent): string | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  // A key pressed on the document itself has no element to have typed into.
  const { target } = event;
  if (
    target instanceof Element &&
    target.closest('input, textarea, select, [contenteditable="true"]')
  ) {
    return null;
  }

  return event.key;
}

/**
 * Turning the sync back on starts a fresh shared view rather than the one it
 * left: that view is stale by then, and both panes would jump to it.
 */
const resync = (on: boolean, setView: (view: PanZoomView | undefined) => void) => {
  if (on) setView(undefined);
};

export function useShotTools({ board, asked, onCropParam }: ShotToolsInput): {
  /** What the stage is handed, exactly — the overlay is the host's to draw. */
  tools: Omit<ShotTools, 'overlay'>;
  onSync: (on: boolean) => void;
  layout: ShotLayout;
  onLayout: (layout: ShotLayout) => void;
  /** For the overlay's "crop the board" press: back beside, ready to drag. */
  askCrop: () => void;
} {
  const [sync, setSync] = useState(true);
  const [view, setView] = useState<PanZoomView | undefined>(undefined);
  const [cropping, setCropping] = useState(false);
  const [layout, setLayout] = useState<ShotLayout>('side by side');
  const rect = parseCrop(asked);
  const crop = useBoardCrop(board, rect);

  const onSync = (on: boolean) => {
    resync(on, setView);
    setSync(on);
  };

  // `s` sync, `o` overlay, `c` crop: the letters the view's hint line names.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = shortcut(event);
      if (key === 's') {
        setSync((on) => {
          resync(!on, setView);
          return !on;
        });
      } else if (key === 'o') {
        setLayout((at) => (at === 'overlay' ? 'side by side' : 'overlay'));
      } else if (key === 'c') {
        setCropping((on) => !on);
      }
    };
    document.addEventListener('keydown', onKey);

    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return {
    tools: {
      sync,
      view,
      onViewChange: setView,
      cropping,
      onCropping: setCropping,
      // A finished crop pins and leaves crop mode: one drag, one region.
      onCrop: (picked: PanZoomRect) => {
        setCropping(false);
        onCropParam(cropParam(picked));
      },
      crop,
      onClearCrop: () => onCropParam(null),
    },
    onSync,
    layout,
    onLayout: setLayout,
    askCrop: () => {
      setLayout('side by side');
      setCropping(true);
    },
  };
}
