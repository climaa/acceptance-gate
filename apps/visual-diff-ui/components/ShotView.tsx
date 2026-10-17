'use client';

import NextLink from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { Dialog, IconButton, Stack } from '@gate/ui';
import type { Tier } from '@gate/visual-diff/policy';
import { useMediaQuery, WIDE_VIEWPORT } from '@/hooks/useMediaQuery';
import { defaultBoard, type DesignBoard, isDesignBoard } from '@/lib/comparison';
import type { Readings } from '@/lib/readings';
import { setHref, shotViewHref } from '@/lib/shots';
import { APP_NAME } from '@/lib/site';
import { GridGlyph, SPLIT_LABELS, SplitGlyph } from './ComparisonModal';
import { type DesignShot, DesignStage, type Split } from './DesignStage';

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

const HINT = 'drag the board · + − zoom · 0 reset';

export interface ShotViewProps {
  label: string;
  /** The sentence the shot is known by: story, viewport and theme. */
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
  const pickBoard = (next: DesignBoard) =>
    window.history.replaceState(
      null,
      '',
      shotViewHref(label, shot.key, next === defaultBoard(tier) ? null : next),
    );

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
          {title} · {label}
        </h2>
        <Stack direction="row" gap={2} align="center">
          {wide && (
            <IconButton
              variant="ghost"
              label={SPLIT_LABELS[layout]}
              onClick={() => setLayout(layout === 'columns' ? 'rows' : 'columns')}
            >
              <SplitGlyph to={layout === 'columns' ? 'rows' : 'columns'} />
            </IconButton>
          )}
          <IconButton
            variant="ghost"
            label="grid"
            aria-pressed={grid}
            onClick={() => setGrid(!grid)}
          >
            <GridGlyph />
          </IconButton>
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
