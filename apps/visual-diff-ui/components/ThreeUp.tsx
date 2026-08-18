'use client';

import { Stack, Thumbnail } from '@gate/ui';
import type { ComparisonMode } from '@/lib/comparison';
import type { ReportSides } from '@/lib/report-view';
import { absentShotCopy, shotSources, type ShotKind } from '@/lib/shots';
import type { Variant } from '@/lib/summary';

/**
 * One variant's evidence: the two shots and the diff between them, in three
 * frames of equal width.
 *
 * The viewer is per VARIANT rather than per card, which is the one place this
 * departs from the issue's wording: a card is a story in a bucket and carries
 * every viewport/theme pair of it, while a shot exists for exactly one of those
 * pairs. Three frames per card would have to pick one variant's pixels and
 * caption them with the story's name.
 *
 * Every frame is the same box whether or not it has an image behind it — a side
 * that does not exist says so in words, because an empty frame reads as a shot
 * that failed to load, and those are two very different reports. An absent side
 * is also not a button: there is nothing to open.
 */

interface ShotFrameProps {
  kind: ShotKind;
  /** The frame's accessible name: `A · <label>`, `B · <label>`, or `diff`. The
   *  side letter alone would not say which capture set it is. */
  name: string;
  src?: string;
  absent: string;
  onOpen: () => void;
}

function ShotFrame({ kind, name, src, absent, onOpen }: ShotFrameProps) {
  const shot = (
    <Thumbnail
      src={src}
      // The kind of shot and nothing else, so the modal's `img "baseline"` and
      // this frame's are the same name for the same thing.
      alt={kind}
      fallback={<span className="vd-shot__absent">{absent}</span>}
    />
  );

  return (
    <figure className="vd-shot" aria-label={name}>
      <figcaption className="vd-shot__label vd-mono" title={name}>
        {name}
      </figcaption>

      {/* A frame with no shot behind it is not a control: there is nothing to
          open, and a button that answers nothing is worse than no button. */}
      {src === undefined ? (
        shot
      ) : (
        <button
          type="button"
          className="vd-shot__open"
          aria-label={`open ${kind}`}
          onClick={onOpen}
        >
          {shot}
        </button>
      )}
    </figure>
  );
}

export interface ThreeUpProps {
  reportId: string;
  variant: Variant;
  /** The two capture-set labels the report compares, A then B. */
  sides: ReportSides;
  /** Opens the comparison modal on this variant, in the mode the control that
   *  was pressed means. */
  onCompare: (variant: Variant, mode: ComparisonMode) => void;
}

export function ThreeUp({ reportId, variant, sides, onCompare }: ThreeUpProps) {
  const shots = shotSources(reportId, variant);

  const frames: readonly { kind: ShotKind; name: string }[] = [
    { kind: 'baseline', name: `A · ${sides.a}` },
    { kind: 'candidate', name: `B · ${sides.b}` },
    { kind: 'diff', name: 'diff' },
  ];

  return (
    <Stack gap={2} className="vd-three-up">
      <div className="vd-three-up__frames">
        {frames.map(({ kind, name }) => (
          <ShotFrame
            key={kind}
            kind={kind}
            name={name}
            src={shots[kind]}
            absent={absentShotCopy(variant, kind)}
            onOpen={() => onCompare(variant, kind)}
          />
        ))}
      </div>

      {/* Both tools open the same modal — they differ only in the mode it
          opens in, which is why neither is a toggle here. */}
      <Stack direction="row" gap={2} wrap>
        <button
          type="button"
          className="vd-tool"
          onClick={() => onCompare(variant, 'blink')}
        >
          blink
        </button>
        <button
          type="button"
          className="vd-tool"
          onClick={() => onCompare(variant, 'slider')}
        >
          slider overlay
        </button>
      </Stack>
    </Stack>
  );
}
