import { useId } from 'react';
import { BucketChip, Stack } from '@gate/ui';
import type { ComparisonMode } from '@/lib/comparison';
import {
  cardElementId,
  cardReviewed,
  formatPixels,
  type ReportCard,
  type ReportSides,
} from '@/lib/report-view';
import type { Variant } from '@/lib/summary';
import { BUCKET_TONES } from './BucketChipRow';
import { TriStateCheckbox } from './TriStateCheckbox';
import { VariantRow } from './VariantRow';

/**
 * One story, in one bucket: the unit a reviewer decides about.
 *
 * The card is the walk unit as well as the mark unit — `j`/`k` move focus
 * between cards, `space` marks the focused one — so it is focusable (`tabIndex`
 * -1, reached by script rather than by Tab) and states its focus in CSS. Its
 * checkbox is tri-state because a story is usually several variants: none, some
 * or all of them looked at.
 *
 * An `a11y` card carries the one sentence this whole screen exists to say, and
 * carries no accept affordance of any kind — reviewing records that a human
 * looked, and looking has never fixed a contrast ratio.
 */

/** Pinned copy. The accept gate refuses a report with any a11y failure
 *  (lib/accept-gate.ts) and this is the card's half of that same refusal. */
export const A11Y_VERDICT = 'reviewing does not clear this — fixing does';

export interface StoryCardProps {
  reportId: string;
  card: ReportCard;
  sides: ReportSides;
  /** Every variant key marked reviewed in this report, in this browser. */
  reviewed: ReadonlySet<string>;
  onToggle: (card: ReportCard, reviewed: boolean) => void;
  onCompare: (variant: Variant, mode: ComparisonMode) => void;
}

export function StoryCard({
  reportId,
  card,
  sides,
  reviewed,
  onToggle,
  onCompare,
}: StoryCardProps) {
  const titleId = useId();
  const all = cardReviewed(card, reviewed);
  const some = card.variants.some((variant) => reviewed.has(variant.key));

  return (
    <article
      id={cardElementId(card.key)}
      className="vd-card"
      aria-labelledby={titleId}
      data-report-card={card.key}
      // Focusable by script, never by Tab: the report can hold hundreds of
      // these, and a tab stop per card would bury the review bar's controls.
      tabIndex={-1}
    >
      <Stack direction="row" gap={3} align="baseline" wrap className="vd-card__head">
        <TriStateCheckbox
          label="reviewed"
          checked={all}
          indeterminate={some && !all}
          onChange={(next) => onToggle(card, next)}
        />

        {/* No `onClick`: on a card the chip reports its bucket rather than
            filtering by it — the atom is documented for exactly that use, and a
            chip that filtered from here would move the whole report out from
            under the card the reviewer is reading. */}
        <BucketChip
          tone={BUCKET_TONES[card.bucket]}
          label={card.bucket}
          count={card.variants.length}
        />

        <h3 className="vd-card__title" id={titleId}>
          {card.title}
        </h3>

        <span className="vd-card__worst vd-mono">
          worst {formatPixels(card.worst)} px
        </span>

        <span className="vd-card__slug vd-mono" title={card.storyId}>
          {card.storyId}
        </span>
      </Stack>

      <Stack gap={3}>
        {card.variants.map((variant) => (
          <VariantRow
            key={variant.key}
            reportId={reportId}
            variant={variant}
            sides={sides}
            onCompare={onCompare}
          />
        ))}
      </Stack>

      {card.bucket === 'a11y' && (
        <p className="vd-card__verdict">
          no accept affordance — <strong>{A11Y_VERDICT}</strong>
        </p>
      )}
    </article>
  );
}
