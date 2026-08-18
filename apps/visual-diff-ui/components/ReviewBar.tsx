'use client';

import { Button, Stack } from '@gate/ui';

/**
 * Where the reviewer stands, and the four controls that move them.
 *
 * The progress text is pinned to `reviewed N/M` with no inner spaces and lives
 * alone inside `data-testid="review-progress"` — the bar beside it is decorative
 * and the percentage is a second element, because a testid whose text has to
 * match a regex cannot also carry the things a human reads around it.
 *
 * It announces politely: `role="status"` is an implicit `aria-live="polite"`
 * region, so marking a card reaches a screen reader as one sentence rather than
 * as the storm a live region on the card list would produce.
 */

const FILTER_LABEL = 'title or story id';

/** Ends in an ellipsis, so an example can never be read as a value. */
const FILTER_PLACEHOLDER = 'PostTemplate…';

export interface ReviewBarProps {
  filter: string;
  onFilter: (value: string) => void;
  hideReviewed: boolean;
  onHideReviewed: (value: boolean) => void;
  /** Variant keys marked, against every variant the report holds. */
  reviewed: number;
  total: number;
  onNextUnreviewed: () => void;
  /** Whether every section is currently collapsed — the one control whose name
   *  states the action rather than the state, so it has to know. */
  allCollapsed: boolean;
  onCollapseAll: (collapsed: boolean) => void;
}

function Progress({ reviewed, total }: { reviewed: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((reviewed / total) * 100);

  return (
    <Stack direction="row" gap={2} align="center" className="vd-review__progress">
      {/* `reviewed {n}/{m}` renders as one text node run with no spaces around
          the slash — the format downstream matches with an anchored regex. */}
      <span className="vd-mono" data-testid="review-progress" role="status">
        reviewed {reviewed}/{total}
      </span>

      <span className="vd-review__bar" aria-hidden="true">
        <span className="vd-review__bar-fill" style={{ inlineSize: `${percent}%` }} />
      </span>

      <span className="vd-mono vd-review__percent">{percent}%</span>
    </Stack>
  );
}

export function ReviewBar({
  filter,
  onFilter,
  hideReviewed,
  onHideReviewed,
  reviewed,
  total,
  onNextUnreviewed,
  allCollapsed,
  onCollapseAll,
}: ReviewBarProps) {
  return (
    <Stack direction="row" gap={4} align="center" wrap className="vd-review">
      <Stack direction="row" gap={2} align="center" className="vd-field">
        <label className="vd-field__label" htmlFor="vd-report-filter">
          {FILTER_LABEL}
        </label>
        <input
          id="vd-report-filter"
          name="filter"
          type="search"
          className="vd-field__input vd-review__search"
          value={filter}
          placeholder={FILTER_PLACEHOLDER}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => onFilter(event.target.value)}
        />
      </Stack>

      <Progress reviewed={reviewed} total={total} />

      <label className="vd-review__hide">
        <input
          type="checkbox"
          checked={hideReviewed}
          onChange={(event) => onHideReviewed(event.target.checked)}
        />
        <span>hide reviewed</span>
      </label>

      {/* The F1 accelerator, and the same code path `n` runs. */}
      <Button variant="secondary" size="sm" onClick={onNextUnreviewed}>
        next unreviewed
      </Button>

      <Button variant="ghost" size="sm" onClick={() => onCollapseAll(!allCollapsed)}>
        {allCollapsed ? 'expand all' : 'collapse all'}
      </Button>
    </Stack>
  );
}
