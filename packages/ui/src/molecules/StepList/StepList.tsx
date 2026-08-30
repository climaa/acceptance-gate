/**
 * What a keyword means, as Gherkin resolves it. Optional on a step because a
 * caller may not have it — this package parses nothing and takes the answer.
 */
export type StepMeaning = 'Context' | 'Action' | 'Outcome' | 'Conjunction' | 'Unknown';

export interface StepListItem {
  /** The keyword as authored: `Given`, `When`, `Then`, `And`, `But`, `*`. */
  keyword: string;
  /**
   * What that keyword means. Supplying it groups the list into runs; leaving it
   * off renders a plain numbered list, which is the same steps in the same order
   * with less said about them.
   */
  meaning?: StepMeaning;
  text: string;
}

export interface StepListProps {
  steps: StepListItem[];
  className?: string;
}

const RUN_OF: Partial<Record<StepMeaning, string>> = {
  Context: 'context',
  Action: 'action',
  Outcome: 'outcome',
};

/**
 * Which run each step belongs to.
 *
 * A conjunction carries no meaning of its own — Gherkin reports `And` and `But`
 * as `Conjunction`, never as the thing they continue — so it inherits the last
 * run that had one. That fold is the whole reason this component asks for
 * `meaning` at all: without it, "And the deletion is refused" and "And I choose
 * two sets" render identically while being an assertion and an action.
 *
 * A conjunction before any typed step inherits nothing and stays undefined,
 * which is correct: there is no run for it to continue.
 *
 * Only a conjunction inherits, and that is the whole of the rule. Anything else
 * starts fresh — a keyword with its own meaning, an `Unknown`, and a caller that
 * supplied no meaning at all. Carrying the run forward for that last case was a
 * bug: a partially typed list rendered a `Then` with no meaning as a
 * continuation of the `Action` above it, which is the exact misreading this
 * component exists to prevent.
 */
function runsOf(steps: StepListItem[]): (string | undefined)[] {
  let run: string | undefined;

  return steps.map((step) => {
    run = step.meaning === 'Conjunction' ? run : RUN_OF[step.meaning ?? 'Unknown'];
    return run;
  });
}

/**
 * A scenario's steps as a numbered list of things a reader does — deliberately
 * not a code block. The board rules on this (D4): a list keeps the ordinality
 * and the list semantics a `<pre>` drops, and reads as steps to perform rather
 * than source to inspect.
 *
 * Numbering stays native and continuous across runs, so the `<ol>` counts and no
 * caller has to.
 */
export function StepList({ steps, className }: StepListProps) {
  if (steps.length === 0) {
    return null;
  }

  const runs = runsOf(steps);
  const typed = runs.some(Boolean);

  return (
    <ol
      className={['ds-step-list', typed && 'ds-step-list--typed', className]
        .filter(Boolean)
        .join(' ')}
    >
      {steps.map((step, index) => (
        // Keyed by position: the same step text may legitimately appear twice in
        // one scenario, and the order is the requirement.
        <li
          key={index}
          className="ds-step-list__item"
          data-run={runs[index]}
          // Marks where one run ends and the next begins, so the separation is
          // drawn rather than left to colour. Without it the only thing telling
          // an action run from an outcome run is hue, and in the dark palette
          // `--color-accent` and `--color-success-fg` are both greens — measured
          // at #80EE64 and #BFF9B4, indistinguishable across a 2px rule, so all
          // three steps read as one run.
          data-run-start={index === 0 || runs[index] !== runs[index - 1] ? '' : undefined}
        >
          <span className="ds-step-list__keyword">{step.keyword}</span> {step.text}
        </li>
      ))}
    </ol>
  );
}
