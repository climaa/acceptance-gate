'use client';

/* eslint-disable @next/next/no-img-element -- `next/image` resamples and
   re-encodes what it serves, through a second cache in front of a route that is
   already `immutable`. A viewer whose whole purpose is one-pixel differences
   cannot show a re-encoded copy of the evidence. */

import { useEffect, useRef, useState } from 'react';
import { Dialog, SegmentedControl, Stack } from '@gate/ui';
import { REDUCED_MOTION, useMediaQuery, WIDE_VIEWPORT } from '@/hooks/useMediaQuery';
import {
  clampPosition,
  type ComparisonMode,
  DEFAULT_MODE,
  isComparisonMode,
  MIDPOINT,
  modesFor,
  SCRUB_STEP,
} from '@/lib/comparison';
import { formatPixels, type ReportSides } from '@/lib/report-view';
import {
  absentShotCopy,
  hasPair,
  type ShotKind,
  type ShotSources,
  shotSources,
} from '@/lib/shots';
import type { Variant } from '@/lib/summary';
import { storyTitle } from '@/lib/title';

/**
 * Where a reviewer looks at the pixels: one variant, full-bleed, in whichever
 * of the six ways of comparing two images answers the question they have.
 *
 * Below 768 px the same dialog presents as `Dialog`'s bottom sheet — same role,
 * same name, same close button, with the mode bar in the thumb's reach. That is
 * presentation and nothing else, so every mode scenario runs on both form
 * factors untagged; the one real difference is `actual size`, which is absent
 * where pinch-zoom already does it.
 *
 * The shots are plain `<img>`. `next/image` would resample and re-encode them
 * through `/_next/image`, which is precisely the thing a pixel-diff viewer must
 * never do — a one-pixel difference does not survive a resize — and it would
 * put a second cache in front of a route that is already `immutable`.
 */

/** The dialog's accessible name, pinned: it is how every scenario finds it, on
 *  both form factors. */
const DIALOG_LABEL = 'Comparison';

/** The scrubber's, likewise — it is the divider's accessible twin, and a
 *  scenario moves the divider by moving this. */
const SCRUBBER_LABEL = 'slider position';

const TOOLBAR_LABEL = 'comparison modes';

/**
 * One blink cycle: two steps of `--duration-base` (200 ms), which is the
 * system's own "a control answers a pointer" beat and about as slow as an
 * alternation can be while the eye still reads it as one image moving.
 */
const BLINK_MS = 400;

const DESKTOP_HINT = 'esc close · ← → previous/next variant · drag the divider';
const SHEET_HINT = 'swipe down to close · pinch to zoom';

/** The side a variant has, for the modes that want the candidate: a `removed`
 *  or `errored` variant has only the baseline left to show. */
const presentSide = (shots: ShotSources): ShotKind =>
  shots.candidate === undefined ? 'baseline' : 'candidate';

/** Which shot a single-image mode shows. `actual size` is not a fourth picture
 *  — it is the candidate at 1:1, since that is the shot under judgement and the
 *  diff's magenta band means nothing magnified. */
function shotFor(mode: ComparisonMode, shots: ShotSources): ShotKind {
  if (mode === 'baseline') return 'baseline';
  if (mode === 'diff') return 'diff';

  return presentSide(shots);
}

interface ShotProps {
  kind: ShotKind;
  shots: ShotSources;
  variant: Variant;
  className?: string;
}

/** One shot, or the sentence that says why there is none. */
function Shot({ kind, shots, variant, className }: ShotProps) {
  const src = shots[kind];

  if (src === undefined) {
    return <p className="vd-compare__absent">{absentShotCopy(variant, kind)}</p>;
  }

  return (
    <img
      className={['vd-compare__shot', className].filter(Boolean).join(' ')}
      src={src}
      alt={kind}
    />
  );
}

/** The two shots in the same place, one after the other.
 *
 *  The alternation is a timer rather than a CSS animation because it swaps
 *  which image is in the document — an `img` alternating under opacity would
 *  leave both named at once, and "the shot alternates between baseline and
 *  candidate" is exactly what a scenario reads. Under `prefers-reduced-motion`
 *  the timer never starts: both frames are acceptable statically, and a blink
 *  is the one thing a reader who asked for stillness must not be given. */
function BlinkStage({ shots, variant }: { shots: ShotSources; variant: Variant }) {
  const pair = hasPair(shots);
  const still = useMediaQuery(REDUCED_MOTION, false);
  const [side, setSide] = useState<ShotKind>('baseline');

  useEffect(() => {
    if (!pair || still) return;

    const timer = setInterval(
      () => setSide((shown) => (shown === 'baseline' ? 'candidate' : 'baseline')),
      BLINK_MS,
    );

    return () => clearInterval(timer);
  }, [pair, still]);

  const shown = pair ? side : presentSide(shots);

  return <Shot kind={shown} shots={shots} variant={variant} />;
}

interface SplitStageProps {
  shots: ShotSources;
  variant: Variant;
  position: number;
  onPosition: (position: number) => void;
}

/** Baseline under candidate, the candidate clipped at the divider.
 *
 *  The divider carries no interactive role of its own: it is a drag affordance,
 *  and everything it can do the scrubber below the stage can do from the
 *  keyboard. Two controls for one value would be two things to announce. */
function SplitStage({ shots, variant, position, onPosition }: SplitStageProps) {
  const stage = useRef<HTMLDivElement>(null);

  const fromPointer = (clientX: number) => {
    const box = stage.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;

    onPosition(clampPosition(((clientX - box.left) / box.width) * 100));
  };

  return (
    <div ref={stage} className="vd-compare__split">
      <Shot kind="baseline" shots={shots} variant={variant} />

      <div className="vd-compare__over" style={{ clipPath: `inset(0 0 0 ${position}%)` }}>
        <Shot kind="candidate" shots={shots} variant={variant} />
      </div>

      {/* `left`, not `inset-inline-start`: the value is read back off a
          pointer's own coordinate, which has no writing direction. */}
      <div
        data-testid="slider-divider"
        aria-hidden="true"
        className="vd-compare__divider"
        style={{ left: `${position}%` }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          fromPointer(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            fromPointer(event.clientX);
          }
        }}
      >
        <span className="vd-compare__handle" />
      </div>
    </div>
  );
}

/** What one key press does to the divider. Home and End are the two answers a
 *  reviewer reaches for once they have found the difference: all of one shot,
 *  or all of the other. */
const SCRUB_KEYS: Record<string, (position: number) => number> = {
  ArrowRight: (position) => position + SCRUB_STEP,
  ArrowUp: (position) => position + SCRUB_STEP,
  ArrowLeft: (position) => position - SCRUB_STEP,
  ArrowDown: (position) => position - SCRUB_STEP,
  Home: () => 0,
  End: () => 100,
};

/** The divider's accessible twin: same number, reachable from the keyboard. */
function Scrubber({
  position,
  onPosition,
}: {
  position: number;
  onPosition: (position: number) => void;
}) {
  return (
    <div
      role="slider"
      aria-label={SCRUBBER_LABEL}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={position}
      aria-valuetext={`${position}%`}
      tabIndex={0}
      className="vd-scrub"
      onKeyDown={(event) => {
        const move = SCRUB_KEYS[event.key];
        if (!move) return;

        // Claims the key from the modal's own ← → walk: a reviewer nudging the
        // divider must not be thrown onto the next variant instead.
        event.preventDefault();
        onPosition(clampPosition(move(position)));
      }}
    >
      <span className="vd-scrub__fill" style={{ width: `${position}%` }} />
      <span className="vd-scrub__knob" style={{ left: `${position}%` }} />
    </div>
  );
}

/** Which way one key walks the list. */
const WALK_KEYS: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };

interface Walk {
  variants: readonly Variant[];
  current: Variant;
  onVariant: (variant: Variant) => void;
}

/** ← → walk the variants the report is showing, in its own order. It does not
 *  wrap: the ends of the list are where a reviewer expects to stop. */
function useVariantKeys(walk: Walk): void {
  // The listener binds once; what it reads has to be this render's answer
  // rather than the one that was current when it bound. The same shape
  // `useReportKeys` uses, for the same reason.
  const latest = useRef(walk);
  useEffect(() => {
    latest.current = walk;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // A control inside the modal that already answered this key owns it —
      // the scrubber is the one that does.
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey)
        return;

      const step = WALK_KEYS[event.key];
      if (step === undefined) return;

      const { variants, current, onVariant } = latest.current;
      const index = variants.findIndex((entry) => entry.key === current.key);
      const next = variants[index + step];
      if (!next) return;

      event.preventDefault();
      onVariant(next);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
}

interface StageProps extends SplitStageProps {
  mode: ComparisonMode;
  /** Whether slider mode has two shots to split. One side missing is not a
   *  split with an empty half — it is a single shot. */
  split: boolean;
}

function Stage({ mode, split, shots, variant, position, onPosition }: StageProps) {
  if (split) {
    return (
      <SplitStage
        shots={shots}
        variant={variant}
        position={position}
        onPosition={onPosition}
      />
    );
  }

  if (mode === 'blink') return <BlinkStage shots={shots} variant={variant} />;

  return (
    <Shot
      kind={shotFor(mode, shots)}
      shots={shots}
      variant={variant}
      className={mode === 'actual size' ? 'vd-compare__shot--actual' : undefined}
    />
  );
}

export interface ComparisonModalProps {
  reportId: string;
  /** The variant on screen. Rendering this component at all is what "open"
   *  means — a closed modal is not a hidden one. */
  variant: Variant;
  /** Every variant the modal can show, in the order the run wrote them —
   *  worst first: what ← → walks. */
  variants: readonly Variant[];
  sides: ReportSides;
  mode: ComparisonMode;
  onMode: (mode: ComparisonMode) => void;
  onVariant: (variant: Variant) => void;
  onClose: () => void;
}

export function ComparisonModal({
  reportId,
  variant,
  variants,
  sides,
  mode,
  onMode,
  onVariant,
  onClose,
}: ComparisonModalProps) {
  const wide = useMediaQuery(WIDE_VIEWPORT, true);
  const [position, setPosition] = useState(MIDPOINT);

  useVariantKeys({ variants, current: variant, onVariant });

  const modes = modesFor(wide);
  // A link written on a desktop opens on a phone, where `actual size` has no
  // control: the stage and the toolbar have to be showing the same mode.
  const active = modes.includes(mode) ? mode : DEFAULT_MODE;

  const shots = shotSources(reportId, variant);
  const split = active === 'slider' && hasPair(shots);

  const title = `${storyTitle(variant.id)} · ${variant.viewport}/${variant.theme}`;

  return (
    <Dialog open onClose={onClose} label={DIALOG_LABEL} className="vd-compare">
      <Stack gap={3}>
        <Stack direction="row" gap={3} align="baseline" wrap className="vd-compare__head">
          <h2 className="vd-compare__title vd-mono" title={title}>
            {title}
          </h2>

          <SegmentedControl
            role="toolbar"
            label={TOOLBAR_LABEL}
            className="vd-compare__modes"
            options={modes.map((name) => ({ value: name, label: name }))}
            value={active}
            // The control's API is a plain string — the guard is what narrows
            // it back to a mode, rather than a cast that would assume it.
            onChange={(picked) => {
              if (isComparisonMode(picked)) onMode(picked);
            }}
          />
        </Stack>

        {/* Same rule as the row this modal was opened from: a pixel count only
            means something where two shots were put against each other. A
            variant with one side carries `compare.mjs`'s zeros, and `0 px
            differ in the shared area` over a story with no baseline reports a
            clean shared area that never existed. The stage below already says
            which side is missing. */}
        {hasPair(shots) && (
          <p className="vd-compare__metric">
            <span className="vd-mono">{formatPixels(variant.overlapDiffPixels)} px</span>{' '}
            differ in the shared area
          </p>
        )}

        {/*
          `tabIndex={0}` for the same reason LogTail carries one: the stage
          scrolls by construction (`max-height: 60vh` with `overflow: auto`, so
          any shot taller than the viewport pans inside it), and a region that
          scrolls but cannot be focused is unreachable from the keyboard —
          WCAG 2.1.1, and axe's `scrollable-region-focusable`. Unconditional,
          because whether a given screenshot overflows is a runtime measurement
          this component cannot make. The `Stage`'s own controls are pointer
          affordances on the image, not tab stops that would carry the scroll.
        */}
        <div className="vd-compare__stage" tabIndex={0}>
          <Stage
            mode={active}
            split={split}
            shots={shots}
            variant={variant}
            position={position}
            onPosition={setPosition}
          />
        </div>

        {split && <Scrubber position={position} onPosition={setPosition} />}

        <p className="vd-compare__sides vd-mono">
          A {sides.a} · B {sides.b}
        </p>
        <p className="vd-compare__hint vd-mono">{wide ? DESKTOP_HINT : SHEET_HINT}</p>
      </Stack>
    </Dialog>
  );
}
