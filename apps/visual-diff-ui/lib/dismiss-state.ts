/**
 * The run this browser has put away in the current-job panel.
 *
 * Browser-only state, for the same reason the review marks are
 * (lib/review-state.ts): which run one reader is done looking at is not a fact
 * about the run. It never reaches the server, so nothing here may be called
 * during a server render.
 *
 * `GET /api/jobs/current` answers with the LAST run when nothing is running —
 * deliberately, because `exit <code>` is the line that matters most and a panel
 * that empties as a job ends throws it away. The consequence is that the panel's
 * empty state is otherwise unreachable on any instance that has ever run
 * anything, and this is what gives it back.
 *
 * A dismissal hides; it never deletes. The history row, the log and the report
 * are untouched, which is why one job id is the whole of what is stored: the
 * next run has a different id and the panel shows it without being asked.
 */

import { withStorage } from './browser-storage';

/** `vd-current-job-dismissed` → one job id. One key and one value, so what this
 *  stores cannot grow with the history it is read against. */
export const DISMISS_STORAGE_KEY = 'vd-current-job-dismissed';

/**
 * The job id this browser has put away, or null.
 *
 * Anything that is not a string was not written by this app — a hand-edited
 * value, or a shape from a future version. Reading it as "nothing dismissed" is
 * recoverable; the next dismissal rewrites it.
 */
export function readDismissed(): string | null {
  return withStorage<string | null>(null, (storage) => {
    const raw = storage.getItem(DISMISS_STORAGE_KEY);

    return typeof raw === 'string' && raw.length > 0 ? raw : null;
  });
}

/**
 * Puts `jobId` away, replacing whatever was there. `null` is the other
 * direction — nothing dismissed — which is what a start that the server refused
 * has to be able to say: it cleared the card on the click and now owes the
 * reader the run they were looking at.
 *
 * A write storage refuses is silent by design — see the hook, which renders from
 * its own snapshot rather than from this.
 */
export function setDismissed(jobId: string | null): void {
  withStorage(undefined, (storage) =>
    jobId === null
      ? storage.removeItem(DISMISS_STORAGE_KEY)
      : storage.setItem(DISMISS_STORAGE_KEY, jobId),
  );
}
