'use client';

import { useState } from 'react';
import { Stack } from '@gate/ui';
import { PruneButton } from './ConfirmDialogs';

/**
 * How many capture sets to keep, and the button that retires the rest.
 *
 * A client island because the number and the confirmation are one control: the
 * dialog names the sets this count is about to remove, so the count cannot live
 * in an uncontrolled input the dialog would have to read back out of the DOM.
 *
 * Nothing is deleted from here (D2). The button opens the confirmation; the
 * confirmation is what calls `POST /api/prune`.
 */

const KEEP_ID = 'vd-keep-latest';

/** Three sets is the board's default: the newest, the one before it, and the one
 *  a comparison is still open against. */
const DEFAULT_KEEP = 3;

export interface RetentionControlProps {
  /** Every set label, in the order the console shows them — the dialog splits
   *  this list at `keep` to name both halves. */
  labels: readonly string[];
}

export function RetentionControl({ labels }: RetentionControlProps) {
  // Held as text, because a number input can legitimately be empty mid-edit and
  // `NaN` is not a retention policy. The prune button reads the parsed value.
  const [keep, setKeep] = useState(String(DEFAULT_KEEP));
  const parsed = Number.parseInt(keep, 10);

  return (
    <Stack direction="row" gap={3} align="center" wrap className="vd-retention">
      <label className="vd-retention__label" htmlFor={KEEP_ID}>
        keep latest
      </label>
      <input
        id={KEEP_ID}
        className="vd-retention__count"
        type="number"
        min={0}
        step={1}
        value={keep}
        inputMode="numeric"
        onChange={(event) => setKeep(event.target.value)}
      />
      <PruneButton keep={Number.isNaN(parsed) ? 0 : parsed} labels={labels} />
    </Stack>
  );
}
