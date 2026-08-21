'use client';

import { useEffect, useRef } from 'react';

/**
 * The running job's stdout, as far back as the panel keeps it.
 *
 * `aria-live="off"`, deliberately and explicitly: this sits inside the
 * current-job region, which announces politely, and a live stdout stream
 * inherited into that region would read every capture line aloud for the minutes
 * a run takes. The announcement worth hearing is the job's state — mode, label,
 * outcome — and that is what the region around this keeps.
 *
 * The last line of a finished job's log is `exit <code>` (lib/jobs.ts writes it),
 * which is what makes this the surface a streaming test asserts on: a job is over
 * when its own output says what it exited with.
 */

export interface LogTailProps {
  /** Oldest line first, as `GET /api/jobs/current` returns them — and ALL of
   *  them: the endpoint's `TAIL_LINES` is how long the tail is, and this frame
   *  draws the tail it was handed. It used to keep a second, smaller cap of its
   *  own, which meant the poll spent every second fetching lines this component
   *  existed to throw away. One number, and it is the one on the wire. */
  lines: readonly string[];
}

export function LogTail({ lines }: LogTailProps) {
  const frame = useRef<HTMLPreElement>(null);

  // Follow the newest line. Keyed on the line count rather than on the array,
  // which is a new object every poll and would scroll a log nobody is adding to.
  useEffect(() => {
    const element = frame.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lines.length]);

  return (
    // `tabIndex={0}` because the frame scrolls: a region that scrolls but cannot
    // be focused is unreachable from the keyboard (WCAG 2.1.1, and axe's
    // `scrollable-region-focusable`), and this one scrolls by construction — it
    // is a tail with a height.
    <pre
      ref={frame}
      data-testid="log-tail"
      aria-live="off"
      tabIndex={0}
      className="vd-log"
    >
      {lines.join('\n')}
    </pre>
  );
}
