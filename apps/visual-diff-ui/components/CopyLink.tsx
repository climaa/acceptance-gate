'use client';

import { useState } from 'react';
import { Button } from '@gate/ui';

/** The button's name, pinned: it is how a scenario presses it. */
export const COPY_LINK_LABEL = 'copy link';

export const COPIED = 'link copied';

/** The clipboard is refused outside a secure context and by some permission
 *  prompts. The address bar holds the same link either way. */
export const COPY_FAILED = 'could not copy — the link is in the address bar';

type Outcome = typeof COPIED | typeof COPY_FAILED | null;

/**
 * Copies the page's own address — at click time, so it is whichever variant
 * and mode the modal has walked to, not the one it opened on.
 *
 * The outcome is a `role="status"` line, read politely. Never an alert: the
 * console keeps one `role="alert"` region, and a copied link is not news that
 * should interrupt anything.
 */
export function CopyLink() {
  const [outcome, setOutcome] = useState<Outcome>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setOutcome(COPIED);
    } catch {
      setOutcome(COPY_FAILED);
    }
  };

  return (
    <span className="vd-copy-link">
      <Button type="button" variant="ghost" size="sm" onClick={copy}>
        {COPY_LINK_LABEL}
      </Button>
      <span role="status" className="vd-copy-link__status vd-mono">
        {outcome}
      </span>
    </span>
  );
}
