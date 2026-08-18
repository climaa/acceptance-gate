'use client';

export interface SegmentedControlOption {
  /** The identity the caller switches on. Never shown. */
  value: string;
  /** The segment's visible text, which is also its accessible name — exactly,
   *  with nothing appended. */
  label: string;
}

export interface SegmentedControlProps {
  options: readonly SegmentedControlOption[];
  /** The selected option's `value`. A value matching no option presses nothing,
   *  which is a legitimate "not yet chosen" rather than an error to throw on. */
  value: string;
  onChange: (value: string) => void;
  /** The accessible name of the group as a whole. */
  label: string;
  /** `'toolbar'` for a consumer composing this into a mode toolbar; the default
   *  `'group'` is what a lone control should be. */
  role?: 'group' | 'toolbar';
  className?: string;
}

/**
 * An exclusive choice among a handful of options, drawn as one connected strip.
 *
 * This is a **button group**, not a radio group and not a tablist: each segment
 * is a real `<button type="button">` carrying `aria-pressed`, and the container
 * is a plain `role="group"`. That is deliberate and load-bearing — the consuming
 * e2e contract finds a mode by `getByRole('button', { name, exact: true })` and
 * reads the active one off `aria-pressed="true"`, on both form factors. Moving
 * to `role="radio"`/`aria-checked` would make every one of those scenarios
 * unfindable, so this shape is not an implementation detail to tidy later.
 *
 * Every segment stays tabbable — no roving tabindex. A strip of two or three
 * modes is not long enough for arrow-key management to buy anything, and Space
 * and Enter come free from the native button.
 */
export function SegmentedControl({
  options,
  value,
  onChange,
  label,
  role = 'group',
  className,
}: SegmentedControlProps) {
  return (
    <div
      role={role}
      aria-label={label}
      className={['ds-segmented', className].filter(Boolean).join(' ')}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="ds-segmented__segment"
          // Stated on every segment, not only the active one: "false" is what
          // makes the others announce as unpressed rather than as plain buttons.
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
