'use client';

import NextLink from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { Dialog, IconButton, SegmentedControl, Stack } from '@gate/ui';
import type { Tier } from '@gate/visual-diff/policy';
import { useMediaQuery, WIDE_VIEWPORT } from '@/hooks/useMediaQuery';
import { SHOT_LAYOUTS, type ShotLayout, useShotTools } from '@/hooks/useShotTools';
import { defaultBoard, type DesignBoard, isDesignBoard } from '@/lib/comparison';
import type { Readings } from '@/lib/readings';
import { setHref, shotViewHref } from '@/lib/shots';
import { APP_NAME } from '@/lib/site';
import { type DesignShot, DesignStage, type Split } from './DesignStage';
import { OverlayStage } from './OverlayStage';
import { ViewControls } from './ViewControls';

/**
 * One screenshot of a set, beside a design board: the shot view.
 *
 * Not a comparison. There is no before side and no bucket, so none of the
 * comparison modal's six modes and no "compare to" — what is left is the modal's
 * design view, which is the whole of this one. A set is where a person reads a
 * screenshot by eye, so the readings arrive folded to one line there; the pixels
 * are the point.
 *
 * Two presentations of one view, decided by how the address was reached:
 *
 *  - `set` — pressed in the set viewer, and intercepted into its modal slot, so
 *    the set stays mounted beneath with its filters and scroll. The set is the
 *    history entry right behind, so closing is `back()`.
 *  - `direct` — loaded cold. There is no set beneath it, so the view is the page,
 *    with the way back to the set where the close button would be, and the
 *    readings open: a page has the room a modal does not.
 */
export type ShotEntry = 'set' | 'direct';

/** The dialog's accessible name, pinned like the comparison modal's. */
const DIALOG_LABEL = 'Screenshot';

const NOTE = 'design board — reference beside the screenshot, never a side';

const HINT = 's sync · o overlay · c crop · drag to pan · + − zoom · 0 reset';

/** The sync toggle's name, pinned: it is how a scenario presses it. */
const SYNC_LABEL = 'zoom and pan both panes together';

/** lucide's `link`, the glyph Board 04 draws on the sync toggle. */
function LinkGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

/** How the board and the screenshot are put together: side by side, or one
 *  laid on the other — and, side by side, whether the two panes move as one. */
function LayoutControls({
  layout,
  onLayout,
  sync,
  onSync,
}: {
  layout: ShotLayout;
  onLayout: (layout: ShotLayout) => void;
  sync: boolean;
  onSync: (sync: boolean) => void;
}) {
  return (
    <>
      <span className="vd-compare__label vd-mono" aria-hidden="true">
        view
      </span>
      <SegmentedControl
        label="view"
        options={SHOT_LAYOUTS.map((name) => ({ value: name, label: name }))}
        value={layout}
        onChange={(picked) => {
          const next = SHOT_LAYOUTS.find((name) => name === picked);
          if (next) onLayout(next);
        }}
      />
      {layout === 'side by side' && (
        <IconButton
          variant="ghost"
          label={SYNC_LABEL}
          aria-pressed={sync}
          onClick={() => onSync(!sync)}
        >
          <LinkGlyph />
        </IconButton>
      )}
    </>
  );
}

export interface ShotViewProps {
  label: string;
  /** The sentence the shot is known by (`shotTitle`). */
  title: string;
  tier: Tier;
  shot: DesignShot;
  ledger: Readings | null;
  entry: ShotEntry;
}

export function ShotView({ label, title, tier, shot, ledger, entry }: ShotViewProps) {
  const router = useRouter();
  const params = useSearchParams();
  const asked = params.get('board');
  const wide = useMediaQuery(WIDE_VIEWPORT, true);
  // Ways of looking, not things to point someone at — out of the URL, as the
  // comparison modal keeps them.
  const [layout, setLayout] = useState<Split>('columns');
  const [grid, setGrid] = useState(false);

  const board = isDesignBoard(asked) ? asked : defaultBoard(tier);
  // A board equal to the tier's own is not a choice worth recording.
  const boardParam = (picked: DesignBoard) =>
    picked === defaultBoard(tier) ? null : picked;
  const write = (picked: DesignBoard, crop: string | null) =>
    window.history.replaceState(
      null,
      '',
      shotViewHref(label, shot.key, boardParam(picked), crop),
    );
  // A crop is in one board's pixels, so another board drops it.
  const pickBoard = (next: DesignBoard) => write(next, null);
  const tools = useShotTools({
    board,
    frameWidth: shot.width ?? 0,
    asked: params.get('crop'),
    onCropParam: (crop) => write(board, crop),
  });

  const modal = entry === 'set';

  // Next keeps the set mounted under the modal and does not re-apply its
  // metadata on the way back, so the set's title is put back here — the lesson
  // ComparisonRoute measured for the report.
  useEffect(() => {
    if (!modal) return;

    document.title = `${title} · ${APP_NAME}`;
    return () => {
      document.title = `${label} · ${APP_NAME}`;
    };
  }, [modal, title, label]);

  const body = (
    <Stack gap={3}>
      <Stack direction="row" gap={3} align="baseline" wrap className="vd-compare__head">
        {!modal && (
          <NextLink className="vd-shot__back vd-mono" href={setHref(label)}>
            ← set {label}
          </NextLink>
        )}
        <h2 className="vd-compare__title vd-mono" title={title}>
          {title}
        </h2>
        <Stack direction="row" gap={2} align="center">
          <LayoutControls
            layout={tools.layout}
            onLayout={tools.onLayout}
            sync={tools.tools.sync}
            onSync={tools.onSync}
          />
          <ViewControls
            layout={wide && tools.layout === 'side by side' ? layout : null}
            onLayout={setLayout}
            grid={grid}
            onGrid={setGrid}
          />
        </Stack>
      </Stack>

      <p className="vd-compare__metric">{NOTE}</p>

      <DesignStage
        // Below the breakpoint the panes stack whatever was picked.
        split={wide ? layout : 'rows'}
        grid={grid}
        board={board}
        onBoard={pickBoard}
        shot={shot}
        ledger={ledger}
        readingsFolded={modal}
        subject="screenshot"
        tools={{
          ...tools.tools,
          overlay:
            tools.layout === 'overlay' ? (
              <OverlayStage
                shot={shot}
                crop={tools.tools.crop}
                onAskCrop={tools.askCrop}
              />
            ) : null,
        }}
      />

      <p className="vd-compare__hint vd-mono">{modal ? `esc close · ${HINT}` : HINT}</p>
    </Stack>
  );

  if (!modal) return <ShotPage>{body}</ShotPage>;

  return (
    <Dialog
      open
      onClose={() => router.back()}
      label={DIALOG_LABEL}
      className="vd-compare vd-compare--design"
    >
      {body}
    </Dialog>
  );
}

/** The expanded presentation: the same view, as the page's own content. */
function ShotPage({ children }: { children: ReactNode }) {
  return (
    <section className="vd-compare vd-compare--design vd-shot" aria-label={DIALOG_LABEL}>
      {children}
    </section>
  );
}
