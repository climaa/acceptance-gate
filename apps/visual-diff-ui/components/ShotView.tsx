'use client';

import NextLink from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { Dialog, IconButton, SegmentedControl, Stack } from '@gate/ui';
import type { Tier } from '@gate/visual-diff/policy';
import { useMediaQuery, WIDE_VIEWPORT } from '@/hooks/useMediaQuery';
import { useShotAddress } from '@/hooks/useShotAddress';
import { SHOT_LAYOUTS, type ShotLayout } from '@/hooks/useShotTools';
import type { BoardHomes } from '@/lib/comparison';
import type { Readings } from '@/lib/readings';
import {
  DEV_STORYBOOK,
  PUBLISHED_STORYBOOK,
  showsDevStorybook,
  storybookLink,
} from '@/lib/report-view';
import { setHref, shotTitle } from '@/lib/shots';
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

/** lucide's `link`, the glyph x-visual-diff-pages draws on the sync toggle. */
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

/** lucide's `square-arrow-out-up-right`, the glyph x-visual-diff-pages draws beside the
 *  title for the published Storybook. */
function OutGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6" />
      <path d="m21 3-9 9" />
      <path d="M15 3h6v6" />
    </svg>
  );
}

/** The published Storybook's name, pinned: the glyph has no text of its own,
 *  and it is how a scenario finds the link. */
export const PUBLISHED_STORYBOOK_LABEL = 'open in the published Storybook';

/**
 * The title, as the way out to the story itself (x-visual-diff-pages).
 *
 * `viewport/theme · set` opens the dev Storybook, and is a link only while the
 * console runs in development — `localhost:6006` answers nothing anywhere else,
 * and a dead link beside a live one is worse than none, so it is plain text
 * there. The arrow-out square opens the published Storybook, which always
 * answers. Both land on the story in the shot's theme, as the set viewer's two
 * links do.
 *
 * The dev link's name leads with its visible text, so a reader who says what
 * they see still hits it, and says where it goes after.
 */
function ShotTitle({ heading }: { heading: ShotHeading }) {
  const { story, storyId, theme } = heading;
  const { title, place } = headingText(heading);

  return (
    <span className="vd-shot__title">
      <h2 className="vd-compare__title vd-mono" title={title}>
        {story} ·{' '}
        {showsDevStorybook() ? (
          <a
            className="vd-shot__storybook"
            href={storybookLink(DEV_STORYBOOK, storyId, theme)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${place} — dev Storybook`}
          >
            {place}
          </a>
        ) : (
          place
        )}
      </h2>
      <a
        className="vd-shot__published"
        href={storybookLink(PUBLISHED_STORYBOOK, storyId, theme)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={PUBLISHED_STORYBOOK_LABEL}
        title={PUBLISHED_STORYBOOK_LABEL}
      >
        <span aria-hidden="true">
          <OutGlyph />
        </span>
      </a>
    </span>
  );
}

/** What the shot view's title is made of, as the set names the shot. */
interface ShotHeading {
  label: string;
  /** The story's own title, as its group in the set is headed. */
  story: string;
  /** The Storybook id both title links open. */
  storyId: string;
  viewport: string;
  theme: string;
}

/** The sentence the shot is known by — the tab's title and the heading's
 *  tooltip — and the half of it the dev Storybook link is drawn on. */
function headingText({ label, story, viewport, theme }: ShotHeading) {
  return {
    title: shotTitle(story, viewport, theme, label),
    place: `${viewport}/${theme} · ${label}`,
  };
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

/**
 * The tab's title while the view is a modal over its set.
 *
 * Next keeps the set mounted under the modal and does not re-apply its metadata
 * on the way back, so the set's title is put back here — the lesson
 * ComparisonRoute measured for the report. The page presentation has its own
 * metadata and needs none of this.
 */
function useModalTitle(modal: boolean, title: string, label: string) {
  useEffect(() => {
    if (!modal) return;

    document.title = `${title} · ${APP_NAME}`;
    return () => {
      document.title = `${label} · ${APP_NAME}`;
    };
  }, [modal, title, label]);
}

export interface ShotViewProps extends ShotHeading {
  tier: Tier;
  shot: DesignShot;
  ledger: Readings | null;
  entry: ShotEntry;
  /** The board each variant's tile is drawn on (lib/board-homes.ts). */
  homes: BoardHomes;
}

export function ShotView({
  tier,
  shot,
  ledger,
  entry,
  homes,
  ...heading
}: ShotViewProps) {
  const { label } = heading;
  const router = useRouter();
  const params = useSearchParams();
  const wide = useMediaQuery(WIDE_VIEWPORT, true);
  // Ways of looking, not things to point someone at — out of the URL, as the
  // comparison modal keeps them.
  const [layout, setLayout] = useState<Split>('columns');
  const [grid, setGrid] = useState(false);

  const { board, pickBoard, tools, paneZoom, overlay } = useShotAddress({
    label,
    shotKey: shot.key,
    frameWidth: shot.width ?? 0,
    tier,
    homes,
    params,
  });

  const modal = entry === 'set';

  useModalTitle(modal, headingText(heading).title, label);

  const body = (
    <Stack gap={3}>
      <Stack direction="row" gap={3} align="baseline" wrap className="vd-compare__head">
        {!modal && (
          <NextLink className="vd-shot__back vd-mono" href={setHref(label)}>
            ← set {label}
          </NextLink>
        )}
        <ShotTitle heading={heading} />
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
                grid={grid}
                zoom={paneZoom}
                alignment={overlay.alignment}
                onAlignment={overlay.onAlignment}
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
