'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Stack } from '@gate/ui';

/**
 * Pick two capture sets and ask for the comparison — the console's one client
 * island, and the whole of the compare pre-fill seam.
 *
 * **The URL is the seam.** Clicking `compare A ⇄ B` writes
 * `?a=<label>&b=<label>&mode=compare` and nothing else: no store, no context, no
 * fetch. The run panel reads the same three params back with
 * `useSearchParams()`, selects its compare tab and fills its two fields. That
 * choice buys three things a shared store would not — the request is shareable,
 * the server never sees it, and the prerendered shell stays cacheable because
 * this island is the only thing on the page that reads the query string.
 *
 * `router.replace`, not `push`: choosing a different pair is a correction to
 * where the reviewer already is, not a step back through.
 */

const COMPARE_MODE = 'compare';

export interface ComparePickersProps {
  /** Set labels, newest first. Also the option text — the acceptance scenario
   *  chooses a set by the label it reads, so nothing else may be shown here. */
  labels: readonly string[];
}

interface PickerProps {
  name: string;
  value: string;
  labels: readonly string[];
  onChange: (label: string) => void;
}

/** A `<select>` whose accessible name is `A` or `B`, per the pinned contract.
 *  The explicit `background-color`/`color` the design constraints ask for are in
 *  globals.css: a native select otherwise takes the UA's palette and a dark
 *  console gets a light dropdown. */
function Picker({ name, value, labels, onChange }: PickerProps) {
  const id = `vd-compare-${name.toLowerCase()}`;

  return (
    <Stack direction="row" gap={2} align="center" className="vd-picker">
      <label className="vd-picker__label" htmlFor={id}>
        {name}
      </label>
      <select
        id={id}
        className="vd-picker__select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {labels.map((label) => (
          <option key={label} value={label}>
            {label}
          </option>
        ))}
      </select>
    </Stack>
  );
}

export function ComparePickers({ labels }: ComparePickersProps) {
  const router = useRouter();
  const pathname = usePathname();
  // Newest against the one before it: the comparison a reviewer opening this
  // console almost always wants. Both fall back to the only set there is.
  const [baseline, setBaseline] = useState(labels[0] ?? '');
  const [candidate, setCandidate] = useState(labels[1] ?? labels[0] ?? '');

  /* Both pickers follow the list they are handed, the way the run panel's report
     picker does (RunPanel.tsx). `router.refresh()` re-renders this component
     without remounting it, so a `useState` initialiser is read once and never
     again — and the list DOES move under it: a delete or a prune takes a label
     away, and a capture finishing puts a new one at the head.

     Only a value that has left the list is corrected. A reviewer's chosen pair
     survives a set arriving beside it — a selection moving under the cursor is
     worse than a default that has aged — but a `<select>` whose value names no
     option renders with nothing selected and would send `?a=<gone>` to the run
     panel, which is a comparison this instance cannot make. */
  if (labels.length > 0) {
    if (!labels.includes(baseline)) setBaseline(labels[0] ?? '');
    if (!labels.includes(candidate)) setCandidate(labels[1] ?? labels[0] ?? '');
  }

  const compare = () => {
    const query = new URLSearchParams({ a: baseline, b: candidate, mode: COMPARE_MODE });

    // `scroll: false` — the pickers sit below the table the reviewer just chose
    // from, and jumping to the top would move it out from under them.
    router.replace(`${pathname}?${query}`, { scroll: false });
  };

  return (
    <Stack direction="row" gap={3} align="center" wrap className="vd-compare">
      <Picker name="A" value={baseline} labels={labels} onChange={setBaseline} />
      <Picker name="B" value={candidate} labels={labels} onChange={setCandidate} />
      <Button variant="secondary" onClick={compare}>
        compare A ⇄ B
      </Button>
    </Stack>
  );
}
