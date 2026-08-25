// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, describe, expect, it } from 'vitest';
import { OutcomeWord } from '../components/OutcomeWord';
import { type JobState, jobState } from '../lib/outcome';

/**
 * The word and the ring are one fact.
 *
 * The whole reason this component exists is that the two surfaces drawing the
 * status used to derive it separately and disagree — a live job reading
 * `interrupted` in the history table beside a panel saying `running`. So the
 * assertions below are about the binding, never about how the ring looks: a
 * turning ring beside a finished verdict is the same class of bug in a new
 * place, and it is the one this holds shut.
 */

afterEach(cleanup);

const ring = (container: HTMLElement) => container.querySelector('.ds-spinner');

/**
 * Every word that is not `running`.
 *
 * `satisfies` rather than a type annotation, so the literals survive: it still
 * fails the typecheck when a word LEAVES `JobState`, and it additionally
 * refuses `'running'` here, which a plain `JobState[]` would have accepted into
 * a list whose whole meaning is the opposite.
 *
 * The harder direction is a word ARRIVING. A new outcome that nobody listed
 * would simply have no row, and a ring beside it would ship unnoticed — which
 * is precisely the drift `OutcomeWord` exists to prevent, so it is closed at
 * compile time below rather than trusted to whoever adds the word.
 */
const FINISHED = [
  'succeeded',
  'succeeded (diffs)',
  'failed',
  'interrupted',
] as const satisfies readonly Exclude<JobState, 'running'>[];

/** Any word `JobState` carries that neither `running` nor the list above covers.
 *  `never` while the rows are exhaustive. */
type Unlisted = Exclude<JobState, 'running' | (typeof FINISHED)[number]>;

/* Bracketed so `never` is compared as a whole rather than distributed away: the
   annotation resolves to `true` only while nothing is unlisted, so the day a
   fifth outcome joins `JobState` this assignment stops compiling and names the
   file that has to grow a row. */
const EVERY_WORD_HAS_A_ROW: [Unlisted] extends [never] ? true : false = true;

describe('OutcomeWord', () => {
  it('covers every word the console can draw', () => {
    expect(EVERY_WORD_HAS_A_ROW).toBe(true);
  });

  it('turns a ring beside a running job', () => {
    const { container } = render(<OutcomeWord word="running" tone="accent" />);

    expect(ring(container)).not.toBeNull();
  });

  it.each(FINISHED)('draws no ring beside %s', (word) => {
    const { container } = render(<OutcomeWord word={word} tone="muted" />);

    expect(ring(container)).toBeNull();
  });

  it('keeps the word readable beside the ring', () => {
    const { container } = render(<OutcomeWord word="running" tone="accent" />);

    // The ring is `aria-hidden`, so the word is the whole accessible answer —
    // and it must survive being given a sibling.
    expect(container.textContent).toBe('running');
  });

  it('draws the tone as its modifier class', () => {
    const { container } = render(<OutcomeWord word="failed" tone="danger" />);

    expect(container.firstElementChild?.className).toBe('vd-outcome vd-outcome--danger');
  });

  it('rings exactly the state jobState calls running', () => {
    // Bound to the real derivation rather than to the literal: an exit code that
    // has not been reported yet and a lock that is held is what `running` means,
    // and this is the pair the two tables actually pass in.
    const { word, tone } = jobState(null, true);

    const { container } = render(<OutcomeWord word={word} tone={tone} />);

    expect(ring(container)).not.toBeNull();
  });

  it('draws no ring for a job the lock has released', () => {
    // The edge case the history table got wrong before lib/outcome.ts existed:
    // the nulls of a running row and an interrupted one are identical, and only
    // the lock tells them apart.
    const { word, tone } = jobState(null, false);

    const { container } = render(<OutcomeWord word={word} tone={tone} />);

    expect(word).toBe('interrupted');
    expect(ring(container)).toBeNull();
  });
});
