'use client';

import { useState } from 'react';
import { Button } from '@gate/ui';

/** The button's name, pinned: it is how a scenario presses it. */
export const COPY_LINK_LABEL = 'copy link';

export const COPIED = 'link copied';

/** The clipboard is refused outside a secure context and by some permission
 *  prompts. The address bar holds the same link either way. */
export const COPY_FAILED = 'could not copy — the link is in the address bar';

type Outcome = typeof COPIED | typeof COPY_FAILED;

export interface CopyLinkProps {
  /**
   * What the address currently names. The status speaks only while this is
   * still what it was when the button was pressed, so "link copied" never
   * outlives the link it is about. Compared rather than used as a `key`: a
   * remount would drop the focus of a reviewer who pressed the button and
   * then walked with the arrows.
   */
  about: string;
}

/**
 * Copies the page's own address — at click time, so it is whichever variant
 * and mode the modal has walked to, not the one it opened on.
 *
 * The outcome is a `role="status"` line, read politely. Never an alert: the
 * console keeps one `role="alert"` region, and a copied link is not news that
 * should interrupt anything.
 */
export function CopyLink({ about }: CopyLinkProps) {
  const [last, setLast] = useState<{ about: string; outcome: Outcome } | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLast({ about, outcome: COPIED });
    } catch {
      setLast({ about, outcome: COPY_FAILED });
    }
  };

  const outcome = last?.about === about ? last.outcome : null;

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
