import { useId } from 'react';
import { Stack } from '@gate/ui';
import type { ComparisonMode } from '@/lib/comparison';
import {
  countReviewed,
  type ReportCard,
  type ReportSection,
  type ReportSides,
} from '@/lib/report-view';
import type { Variant } from '@/lib/summary';
import { StoryCard } from './StoryCard';
import { TriStateCheckbox } from './TriStateCheckbox';

/**
 * One named region of the results: the accessibility section, or one tier of
 * the design system.
 *
 * The region's accessible name is the section's short name — `Accessibility`,
 * `atoms` — and nothing else, because the ordering contract is asserted by that
 * name and a heading carrying counts would make it drift every time a run does.
 * The counts are in the heading, where a reader wants them.
 *
 * Progress counts the section's own variants, before the text filter and
 * hide-reviewed remove cards from it: a denominator that shrank as the reviewer
 * typed would be a progress bar that measures the filter rather than the work.
 */

export interface TierSectionProps {
  reportId: string;
  section: ReportSection;
  /** The cards that survived the filters — the section still reports on all of
   *  its own variants above them. */
  cards: readonly ReportCard[];
  sides: ReportSides;
  reviewed: ReadonlySet<string>;
  /** Rendered under the heading. The accessibility section explains why it is
   *  not folded into a pixel bucket; a tier has nothing to explain. */
  note?: string;
  /** A viewport this whole tier is never captured at, said once here rather
   *  than repeated verbatim under every card in the section. Muted, not warned:
   *  it explains an absence rather than reporting a failure. */
  viewportNote?: string;
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  onToggleSection: (section: ReportSection, reviewed: boolean) => void;
  onToggleCard: (card: ReportCard, reviewed: boolean) => void;
  onCompare: (variant: Variant, mode: ComparisonMode) => void;
}

export function TierSection({
  reportId,
  section,
  cards,
  sides,
  reviewed,
  note,
  viewportNote,
  collapsed,
  onCollapse,
  onToggleSection,
  onToggleCard,
  onCompare,
}: TierSectionProps) {
  const bodyId = useId();

  const total = section.variantKeys.length;
  const done = countReviewed(section.variantKeys, reviewed);

  return (
    <section aria-label={section.name} className="vd-section">
      <Stack gap={3}>
        <Stack direction="row" gap={3} align="baseline" wrap className="vd-section__head">
          <TriStateCheckbox
            label={section.name}
            checked={done === total && total > 0}
            indeterminate={done > 0 && done < total}
            onChange={(next) => onToggleSection(section, next)}
          />

          <h2 className="vd-section__title">
            {/* The name is the checkbox's visible label beside this heading, so
                it is not repeated on screen — but a heading reading "(6) 2/6"
                names nothing, and this is a landmark's heading. */}
            <span className="ds-visually-hidden">{section.name}</span>{' '}
            <span className="vd-count">({total})</span>{' '}
            <span className="vd-count">
              {done}/{total}
            </span>
          </h2>

          <button
            type="button"
            className="vd-section__collapse"
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            onClick={() => onCollapse(!collapsed)}
          >
            {collapsed ? 'expand' : 'collapse'} {section.name}
          </button>
        </Stack>

        {note && <p className="vd-section__note">{note}</p>}

        {viewportNote && <p className="vd-section__viewports">{viewportNote}</p>}

        {/* Collapsed removes the cards rather than hiding them, the same
            semantics the filters carry: what is not in the DOM is not something
            a reviewer can be told they have seen. */}
        <div id={bodyId}>
          {!collapsed && (
            <Stack gap={4}>
              {cards.map((card) => (
                <StoryCard
                  key={card.key}
                  reportId={reportId}
                  card={card}
                  sides={sides}
                  reviewed={reviewed}
                  onToggle={onToggleCard}
                  onCompare={onCompare}
                />
              ))}
            </Stack>
          )}
        </div>
      </Stack>
    </section>
  );
}
