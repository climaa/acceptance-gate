import { Spinner } from '@gate/ui';
import type { JobState, JobTone } from '@/lib/outcome';

/**
 * The status word, and the ring that turns beside it for as long as the word is
 * `running`.
 *
 * One component for the two surfaces that draw it — the current-job row and the
 * history table — rather than the same span written twice. That duplication is
 * not hypothetical here: `lib/outcome.ts` exists at all because those two
 * derived the word two ways and then disagreed on screen, a live job reading
 * `interrupted` in the table beside a panel saying `running`. The ring is the
 * same fact drawn a second way, so it is bound to the word in one place before
 * it can drift the same distance.
 *
 * Keyed on the word rather than on a `running` boolean threaded in beside it:
 * `jobState` already collapsed the exit code and the lock into this one value,
 * and a second parameter that could contradict it would reopen exactly the gap
 * that file was written to close.
 *
 * The run panel deliberately does NOT use this — it states the same condition
 * as a sentence inside its own `role="alert"`, not as a status word — so it
 * composes `Spinner` directly.
 */
export function OutcomeWord({ word, tone }: { word: JobState; tone: JobTone }) {
  return (
    <span className={`vd-outcome vd-outcome--${tone}`}>
      {word === 'running' && <Spinner />}
      {word}
    </span>
  );
}
