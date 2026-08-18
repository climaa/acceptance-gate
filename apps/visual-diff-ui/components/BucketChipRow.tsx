import { BucketChip, type BucketChipTone, Stack } from '@gate/ui';
import { type BucketFilter, chipOrder, TOTAL_CHIP } from '@/lib/report-view';
import type { Bucket } from '@/lib/summary';

/**
 * The report's verdict in one row, and the report's filter in the same row.
 *
 * Each chip's accessible name is its bucket word and nothing else, so `changed`
 * and `unchanged` are two different names rather than one substring of the
 * other — the distinction the whole gate turns on, and the reason `BucketChip`
 * takes its name as a prop rather than reading its own contents.
 *
 * `total` is the row's "everything" chip: it selects no bucket, which is what
 * the report shows by default, so it is the pressed one until a bucket is
 * chosen.
 */

/**
 * How each bucket looks. `a11y` spends the atom's exclusive tone and no other
 * bucket may borrow it: an accessibility failure is a different kind of finding
 * from a pixel diff, and the row is where a reviewer first sees that. `removed`
 * and `errored` are losses rather than movements, so they take danger; `changed`
 * and `added` are things to look at, so they take the accent; `unchanged` is
 * muted and `total` is neutral, per the issue's own ranking.
 */
export const BUCKET_TONES: Record<Bucket, BucketChipTone> = {
  a11y: 'a11y',
  changed: 'accent',
  added: 'accent',
  removed: 'danger',
  errored: 'danger',
  unchanged: 'muted',
};

const TOTAL_TONE: BucketChipTone = 'neutral';

const toneOf = (chip: BucketFilter): BucketChipTone =>
  chip === TOTAL_CHIP ? TOTAL_TONE : BUCKET_TONES[chip];

export interface BucketChipRowProps {
  counts: Record<Bucket, number>;
  /** The bucket currently filtered to, or null for "everything". */
  selected: Bucket | null;
  onSelect: (bucket: Bucket | null) => void;
}

export function BucketChipRow({ counts, selected, onSelect }: BucketChipRowProps) {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  return (
    // The group is the element, not the Stack: `Stack` forwards no ARIA
    // attributes, so the name lives on the wrapper and the spacing inside it.
    <div role="group" aria-label="Buckets" className="vd-chips">
      <Stack direction="row" gap={2} wrap>
        {chipOrder(counts.a11y).map((chip) => (
          <BucketChip
            key={chip}
            tone={toneOf(chip)}
            label={chip}
            count={chip === TOTAL_CHIP ? total : counts[chip]}
            pressed={chip === TOTAL_CHIP ? selected === null : selected === chip}
            onClick={() => onSelect(chip === TOTAL_CHIP ? null : chip)}
          />
        ))}
      </Stack>
    </div>
  );
}
