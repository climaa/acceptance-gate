import {
  type FilterCount,
  type FilterKey,
  THEME_CHOICES,
  type ShotSection,
  type TierCounts,
  VIEWPORT_CHOICES,
} from '@/lib/set-shots';

/** Every cell of the filter matrix, in a stable order. */
export const FILTER_KEYS: readonly FilterKey[] = THEME_CHOICES.flatMap((theme) =>
  VIEWPORT_CHOICES.map((viewport): FilterKey => `${theme}|${viewport}`),
);

/**
 * One figure per filter combination, of which CSS reveals the matching one.
 *
 * Shared by the bar's count, the tier jump links and the tier headings — a
 * heading reading "37 stories" over three of them is the page disagreeing with
 * itself, and the disagreement is what a reviewer would trust least.
 */
export function Filtered({
  counts,
  render,
}: {
  counts: Record<FilterKey, FilterCount>;
  render: (count: FilterCount) => string;
}) {
  return (
    <>
      {FILTER_KEYS.map((key) => (
        <span className="vd-filtered" data-for={key} key={key}>
          {render(counts[key])}
        </span>
      ))}
    </>
  );
}

/**
 * The set viewer's pinned bar: where to jump, what to show, and how much of it
 * is showing.
 *
 * A SERVER component with no state, and that is the whole design. The inputs
 * below are real radios, and `set.css` reads `:checked` through `:has()` to hide
 * what a filter excludes — so a page carrying 160 images stays exactly as free of
 * client JavaScript as it was before it could be filtered. The cost is stated
 * rather than hidden: the choice lives in the DOM, not the URL, so a filtered
 * view is not a shareable one.
 *
 * It is a SIBLING of the page header, never inside it. `position: sticky` is
 * clipped by its own parent's box, so a bar nested in a header that scrolls away
 * scrolls away with it.
 *
 * Not `SegmentedControl`, which is the obvious reuse and the wrong one: that atom
 * is a client button group with a required `onChange`, and its doc comment says
 * the e2e contract depends on `role="button"` + `aria-pressed`. Radios that look
 * like a strip cost nothing and need no hydration.
 */

/** Fixed ids, because CSS selects the checked input by id and there is exactly
 *  one bar on the page. `useId` would be correct for a repeated component and
 *  useless here — a generated id cannot be written into a stylesheet. */
const ID = (axis: string, value: string) => `vd-${axis}-${value}`;

interface StripProps {
  axis: 'theme' | 'viewport';
  choices: readonly string[];
}

/**
 * One axis, drawn as a connected strip.
 *
 * A `<fieldset>` so the group carries its own name for a screen reader, and
 * native radios so arrow keys, Space and the checked state all come free. Every
 * visual state is read off `:checked` in CSS rather than from a modifier class —
 * the argument `TriStateCheckbox.css` already makes: what the control looks like
 * and what it IS cannot drift apart if only one of them exists.
 */
function Strip({ axis, choices }: StripProps) {
  return (
    <fieldset className="vd-strip">
      <legend className="vd-strip__legend">{axis}</legend>
      {choices.map((choice) => (
        <span className="vd-strip__segment" key={choice}>
          <input
            className="vd-strip__input"
            defaultChecked={choice === 'both'}
            id={ID(axis, choice)}
            name={`vd-${axis}`}
            type="radio"
          />
          <label className="vd-strip__label" htmlFor={ID(axis, choice)}>
            {choice}
          </label>
        </span>
      ))}
    </fieldset>
  );
}

export interface SetFilterBarProps {
  sections: readonly ShotSection[];
  counts: Record<FilterKey, FilterCount>;
  /** Per tier, so a jump link says how much of ITS tier survives the filter. */
  perTier: TierCounts;
}

export function SetFilterBar({ sections, counts, perTier }: SetFilterBarProps) {
  return (
    <div className="vd-set__bar">
      <nav aria-label="tiers" className="vd-set__nav">
        {sections.map((section) => (
          <a
            className="vd-set__jump vd-mono"
            href={`#vd-tier-${section.tier}`}
            key={section.tier}
          >
            {section.tier}{' '}
            {/* A jump link says how much of ITS tier survives, not how much the
                set holds — otherwise it offers a tier that is no longer there. */}
            <Filtered
              counts={perTier[section.tier]}
              render={(count) => `${count.stories} · ${count.shots}`}
            />
          </a>
        ))}
      </nav>

      <Strip axis="theme" choices={THEME_CHOICES} />
      <Strip axis="viewport" choices={VIEWPORT_CHOICES} />

      {/* All nine answers, one revealed. CSS can hide a screenshot but it cannot
          count what is left, so the alternative to rendering these was a client
          island — see this file's header for why that trade went the other way.
          `aria-live` is deliberately absent: nothing here changes asynchronously,
          and the visible text is already the answer. */}
      <p className="vd-set__counts vd-mono">
        <Filtered
          counts={counts}
          render={(count) =>
            `showing ${count.shots} of ${counts['both|both'].shots} screenshots · ${count.stories} stories`
          }
        />
      </p>
    </div>
  );
}
