'use client';

import { useEffect, useRef } from 'react';

export interface TriStateCheckboxProps {
  /** The binary state. Ignored by assistive technology while `indeterminate`
   *  is set — a mixed control reports "mixed", not "mixed and checked". */
  checked: boolean;
  /** The third state: some, but not all, of whatever the caller counts. */
  indeterminate?: boolean;
  /** Receives the state the control moved to, never the state it left. */
  onChange: (checked: boolean) => void;
  /** The accessible name. Rendered as visible text beside the box, so the
   *  pointer target and the name a screen reader announces are the same node. */
  label: string;
  className?: string;
}

/**
 * A checkbox with three states: unchecked, checked, and mixed.
 *
 * The mixed state is expressed twice on purpose, because the two audiences read
 * different things. `indeterminate` is a DOM *property* with no attribute form —
 * nothing React renders can set it, hence the ref effect — and it is what paints
 * the dash through `:indeterminate` in the stylesheet. `aria-checked="mixed"` is
 * what the accessibility tree reports, stated explicitly rather than left to the
 * browser's implicit mapping so a test can assert it and a partial
 * implementation cannot pass by painting a dash nobody is told about.
 *
 * Nothing here knows what is being counted: the caller owns the none/some/all
 * arithmetic and hands down two booleans.
 */
export function TriStateCheckbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  className,
}: TriStateCheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Keyed on the prop, so the effect also runs when it goes back to false: a
  // property React never wrote is a property React will not clear either.
  useEffect(() => {
    const input = inputRef.current;

    if (input) input.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label className={['ds-tristate-checkbox', className].filter(Boolean).join(' ')}>
      <input
        ref={inputRef}
        type="checkbox"
        className="ds-tristate-checkbox__input"
        checked={checked}
        // Omitted rather than "true"/"false" when not mixed: the native checked
        // state already says that, and an aria-checked that disagreed with it
        // would be the one thing worse than saying nothing.
        aria-checked={indeterminate ? 'mixed' : undefined}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      {/* The painted box. The input itself is the interactive element and keeps
          its focus ring; this span is the surface the ring is drawn around. */}
      <span className="ds-tristate-checkbox__box" aria-hidden="true" />
      <span className="ds-tristate-checkbox__label">{label}</span>
    </label>
  );
}
