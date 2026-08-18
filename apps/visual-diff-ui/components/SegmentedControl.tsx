'use client';

/**
 * The exclusive-mode switch: several options, one of them chosen.
 *
 * **An app-local stand-in for `@gate/ui`'s `SegmentedControl` (#273), which has
 * no branch yet.** The props are that issue's pinned API verbatim — `options`,
 * `value`, `onChange`, `label`, `role`, `className` — so when the atom lands,
 * every call site here changes one import and this file is deleted. Nothing
 * visual-diff-shaped enters it: the comparison vocabulary is the modal's, and
 * this is a control that reports which of several things is chosen.
 *
 * Button-group semantics, not radios, and that is the whole point of the
 * component: the comparison toolbar is queried as
 * `getByRole('button', { name, exact: true })` with the active mode carrying
 * `aria-pressed="true"`, on both form factors. A radio group would make every
 * one of those scenarios unfindable.
 *
 * Every segment stays tabbable — no roving `tabIndex` — so Tab reaches each
 * mode and Space/Enter come free from the native button.
 */

export interface SegmentedControlOption {
  value: string;
  /** The segment's accessible name, exactly: no counts, no decoration. */
  label: string;
}

export interface SegmentedControlProps {
  options: readonly SegmentedControlOption[];
  value: string;
  onChange: (value: string) => void;
  /** The group's own accessible name. */
  label: string;
  /** `toolbar` when the group is a bar of commands rather than one field. */
  role?: 'group' | 'toolbar';
  className?: string;
}

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
      className={['vd-seg', className].filter(Boolean).join(' ')}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="vd-seg__option"
          // Pressed is drawn off the attribute rather than a class, so the
          // state a reader hears and the state a reviewer sees are one value.
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
