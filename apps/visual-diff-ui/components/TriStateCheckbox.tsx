'use client';

import { useEffect, useRef } from 'react';

/**
 * The review-state checkbox: none, some, or all of a group looked at.
 *
 * **An app-local stand-in for `@gate/ui`'s `TriStateCheckbox` (#273), which has
 * no branch yet.** The props are that issue's pinned API verbatim — `checked`,
 * `indeterminate`, `onChange`, `label`, `className` — so when the atom lands,
 * every call site here changes one import and this file is deleted. Nothing
 * visual-diff-shaped enters it, for the same reason the atom will not learn the
 * bucket vocabulary: this is a checkbox that reports three states, and the
 * report is what knows what a state means.
 *
 * `indeterminate` is a DOM property with no attribute, so it is written from an
 * effect rather than rendered — and `aria-checked="mixed"` is stated alongside
 * it, because the property alone leaves a reader hearing "not checked" for a
 * group that is half done.
 */

export interface TriStateCheckboxProps {
  checked: boolean;
  /** Outranks `checked`: some, rather than none or all. */
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  /** The accessible name, rendered beside the box. */
  label: string;
  className?: string;
}

export function TriStateCheckbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  className,
}: TriStateCheckboxProps) {
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (box.current) box.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label className={['vd-tri', className].filter(Boolean).join(' ')}>
      <input
        ref={box}
        type="checkbox"
        className="vd-tri__box"
        checked={checked}
        aria-checked={indeterminate ? 'mixed' : checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="vd-tri__label">{label}</span>
    </label>
  );
}
