'use client';

import { useId } from 'react';

/**
 * The five looks a bucket count can take. Deliberately *not* bucket names: the
 * bucket vocabulary (`changed`, `added`, `unchanged`, …) belongs to whatever
 * reads a report, and a design-system atom that knew it would have to be edited
 * every time the differ grew a category.
 *
 * `a11y` is exclusive — its surface/foreground pairing is shared with no other
 * tone, because an accessibility failure is a different kind of finding from a
 * pixel diff and must never be able to borrow its look.
 */
export type BucketChipTone = 'danger' | 'accent' | 'neutral' | 'muted' | 'a11y';

export interface BucketChipProps {
  /** No default: there is no neutral answer to "which bucket is this". */
  tone: BucketChipTone;
  /** The chip's accessible name, exactly. */
  label: string;
  count: number;
  /** Reflected into `aria-pressed`, for filter use. Omit for a chip that only
   *  reports — `aria-pressed="false"` announces a toggle that does not exist. */
  pressed?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * A count chip: one bucket of a comparison, as a button.
 *
 * The accessible name is `label` and nothing else. Left to the contents it would
 * read `changed 17`, and the surfaces that filter by bucket query these by exact
 * name — a name carrying the count would match nothing, and a name assembled
 * from substrings would make `changed` match `unchanged`. The count is therefore
 * attached as the description rather than being folded into the name or hidden:
 * `aria-hidden` on it would name the chip correctly and drop the one number the
 * chip exists to report.
 *
 * A button whether or not it filters. The board draws one row of chips, all
 * identical; making the non-interactive ones a `<span>` would change their
 * height and baseline for a distinction the reader is not being asked to make.
 */
export function BucketChip({
  tone,
  label,
  count,
  pressed,
  onClick,
  className,
}: BucketChipProps) {
  const countId = useId();

  return (
    <button
      type="button"
      className={['ds-bucket-chip', `ds-bucket-chip--${tone}`, className]
        .filter(Boolean)
        .join(' ')}
      aria-label={label}
      aria-describedby={countId}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {/* Its own text node, never interpolated with the count: the visible text
          must be the accessible name verbatim, or the two disagree for a reader
          using voice control. */}
      <span className="ds-bucket-chip__label">{label}</span>
      <span className="ds-bucket-chip__count" id={countId}>
        {count}
      </span>
    </button>
  );
}
