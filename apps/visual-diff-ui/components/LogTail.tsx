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

/** How much of the tail is drawn. The endpoint already answers with the last 200
 *  lines; this is the panel's own frame — a right-hand column beside three
 *  tables, not a terminal. */
const TAIL_LINES = 24;

export interface LogTailProps {
  /** Oldest line first, as `GET /api/jobs/current` returns them. */
  lines: readonly string[];
}

export function LogTail({ lines }: LogTailProps) {
  const frame = useRef<HTMLPreElement>(null);
  const tail = lines.slice(-TAIL_LINES);

  // Follow the newest line. Keyed on the line count rather than on the array,
  // which is a new object every poll and would scroll a log nobody is adding to.
  useEffect(() => {
    const element = frame.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lines.length]);

  return (
    <pre
      ref={frame}
      data-testid="log-tail"
      aria-live="off"
      tabIndex={0}
      className="vd-log"
    >
      {tail.join('\n')}
    </pre>
  );
}
