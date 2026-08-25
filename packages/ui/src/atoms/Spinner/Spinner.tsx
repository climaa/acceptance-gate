export interface SpinnerProps {
  className?: string;
}

/**
 * A ring that turns while something is in flight.
 *
 * `aria-hidden`, always, and there is deliberately no label prop to override
 * it. Everywhere this stands, the fact it draws is already written beside it in
 * words — `running` in the current-job row and the history table, `a job is
 * already running` in the run panel — and each of those already sits inside a
 * live region that announces once. A `role="status"` of its own would nest a
 * second live region inside the first, announcing the same fact twice and
 * re-announcing it on every poll.
 *
 * `role="alert"` is not an option here at all: the acceptance suite reads
 * refusals through one strict locator, `getByRole('main').getByRole('alert')`,
 * so a second alert inside `main` fails every scenario that reads the first.
 * The rule and its history live in apps/visual-diff-ui/components/Note.tsx.
 *
 * Marking a region busy therefore stays the consumer's call, exactly as it does
 * for `Skeleton` — an atom cannot know the bounds of the region it stands in.
 */
export function Spinner({ className }: SpinnerProps) {
  return (
    <span
      className={['ds-spinner', className].filter(Boolean).join(' ')}
      aria-hidden="true"
    />
  );
}
