'use client';

import { useState } from 'react';
import { Stack } from '@gate/ui';
import type { StoryTier } from '@/lib/stories';
import { TriStateCheckbox } from './TriStateCheckbox';

/**
 * What to capture, ticked rather than typed.
 *
 * `--filter` is a substring matched against a story's id or title, so the field
 * that used to be here accepted anything and told a reviewer nothing: the
 * vocabulary lives in a Storybook build, and remembering `atoms-button` is not
 * something a console should ask for. This offers the corpus instead — the tiers
 * the build holds, and the components under each — and composes the filters from
 * what was ticked.
 *
 * Nothing ticked means the whole corpus, which is what the gate runs and what
 * `matchesFilter` reads an empty list as. It is stated on screen rather than
 * implied, because an empty set of checkboxes could as easily mean "nothing".
 *
 * Tiers collapse, and start collapsed. Twenty-four components is a list longer
 * than the panel it sits in, and the tier is the choice a reviewer makes first —
 * the components under it are the refinement.
 */

export interface FilterPickerProps {
  /** From `GET /api/stories`. Empty when there is no build to read yet. */
  tiers: readonly StoryTier[];
  /** The component filters ticked, as `--filter` values. */
  value: readonly string[];
  onChange: (filters: string[]) => void;
  disabled: boolean;
}

/** The filter values under one tier, so a tier's own box can speak for them. */
const filtersOf = (tier: StoryTier) =>
  tier.components.map((component) => component.filter);

/** `disabled` is deliberately absent: the `<fieldset>` below carries it, and a
 *  native fieldset disables every control inside it. Passing it down as well
 *  would be two answers to one question. */
function TierGroup({
  tier,
  value,
  onChange,
}: { tier: StoryTier } & Omit<FilterPickerProps, 'tiers' | 'disabled'>) {
  const [open, setOpen] = useState(false);
  const filters = filtersOf(tier);
  const picked = filters.filter((filter) => value.includes(filter));

  /** Ticking a tier ticks every component under it; unticking clears only those,
   *  so a tier is never a switch that also silences the tier beside it. */
  const toggleTier = (checked: boolean) => {
    const without = value.filter((filter) => !filters.includes(filter));

    onChange(checked ? [...without, ...filters] : without);
  };

  const toggleComponent = (filter: string, checked: boolean) => {
    onChange(checked ? [...value, filter] : value.filter((other) => other !== filter));
  };

  return (
    <Stack gap={1} className="vd-filter__tier">
      <Stack direction="row" gap={2} align="center">
        <TriStateCheckbox
          label={tier.tier}
          checked={picked.length === filters.length && filters.length > 0}
          indeterminate={picked.length > 0 && picked.length < filters.length}
          onChange={toggleTier}
        />
        {/* The count is on the toggle rather than on the tier's own label, which
            the accessible name of the group is built from. */}
        <button
          type="button"
          className="vd-filter__toggle"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? '−' : '+'} {tier.components.length}
        </button>
      </Stack>

      {open && (
        <Stack gap={1} className="vd-filter__components">
          {tier.components.map((component) => (
            <TriStateCheckbox
              key={component.filter}
              label={component.name}
              checked={value.includes(component.filter)}
              onChange={(checked) => toggleComponent(component.filter, checked)}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

export function FilterPicker({ tiers, value, onChange, disabled }: FilterPickerProps) {
  // A build nobody has made yet. Not a refusal — the capture builds one on its way
  // past — so this says what will happen rather than blocking the run.
  if (tiers.length === 0) {
    return (
      <Stack gap={1} className="vd-filter">
        <span className="vd-field__label">--filter</span>
        <p role="note" aria-label="no corpus yet" className="vd-note">
          no Storybook build to read yet — this run captures the whole corpus, and the
          components appear here once it has built one
        </p>
      </Stack>
    );
  }

  return (
    <fieldset className="vd-filter" disabled={disabled}>
      <legend className="vd-field__label">--filter</legend>
      <Stack gap={2}>
        {tiers.map((tier) => (
          <TierGroup key={tier.tier} tier={tier} value={value} onChange={onChange} />
        ))}
        <p role="note" aria-label="filter scope" className="vd-note">
          {value.length === 0
            ? 'nothing ticked — this run captures the whole corpus'
            : `${value.length} component(s) ticked — this run captures only those`}
        </p>
      </Stack>
    </fieldset>
  );
}
