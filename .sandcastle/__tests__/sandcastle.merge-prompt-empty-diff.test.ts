import {
  NOOP_LABEL,
  NOOP_LABEL_COLOR,
  NOOP_LABEL_DESCRIPTION,
} from '../sandcastle-noop-issues.mts';
import { read } from './helpers';

/**
 * Source-text guards for the merge phase's half of "this branch has nothing to
 * land".
 *
 * The execute phase already retires this shape (partitionOutcomes) and so does
 * the rescue path (strandedDisposition) — both unit-tested. What neither covers
 * is the merger: it receives a branch list and, per its prompt, unconditionally
 * built a body containing `Closes #<ID>`. A PR with zero file changes still
 * merges, and that keyword then auto-closes an issue nobody resolved — a worse
 * failure than the comment spam the execute-phase fix was about, because it
 * hides work that still needs doing rather than merely repeating itself.
 *
 * The prompt is the only place this decision can live for the agent half, so
 * these are text assertions by necessity. The host half is a real unit test
 * (decideActions in sandcastle.pr-queue.test.ts).
 */

const content = read('agent-docs/merge-prompt.md');

/** The gate step alone — the publish step that follows it is Step 1c. */
const gate = content.slice(content.indexOf('## Step 1b'), content.indexOf('## Step 1c'));

/**
 * Just the commands in the gate. The prose around them deliberately names the
 * command it forbids (`gh issue close`), so a "must not appear" assertion has to
 * read the fenced blocks — the markdown equivalent of `stripComments`.
 */
const gateCommands = [...gate.matchAll(/```bash\n([\s\S]*?)```/g)]
  .map((m) => m[1])
  .join('\n');

describe('merge-prompt.md — the empty-net-diff gate', () => {
  it('has a gate step of its own, between the checkout and the publish step', () => {
    // Every assertion below reads this slice, so pin both ends exist and are in
    // order rather than letting a missing heading silently produce '' or the
    // whole file.
    expect(content.indexOf('## Step 1')).toBeLessThan(content.indexOf('## Step 1b'));
    expect(content.indexOf('## Step 1b')).toBeLessThan(content.indexOf('## Step 1c'));
    expect(gateCommands).not.toBe('');
  });

  it('asks git whether the branch has any net change', () => {
    expect(gate).toMatch(/git diff --quiet origin\/main\.\.\.HEAD/);
  });

  it('uses a three-dot diff so base moving ahead does not read as content', () => {
    // Two-dot would report every commit that landed on main since the fork.
    expect(gate).not.toMatch(/git diff --quiet origin\/main\.\.HEAD\b/);
    expect(gate).toMatch(/three dots|three-dot/i);
  });

  it('runs before the push, not just before gh pr create', () => {
    // Earlier is better for this class of bug, and nothing upstream needs the
    // merger's push: main.mts already published every completed branch.
    const gateIdx = content.indexOf('git diff --quiet origin/main...HEAD');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(content.indexOf('git push origin <branch>')).toBeGreaterThan(gateIdx);
    // The invocation, not Step 1's prose mention of `gh pr create --head`.
    expect(content.indexOf('gh pr create \\')).toBeGreaterThan(gateIdx);
  });

  it('reads the exit status, not the output, and names all three answers', () => {
    // `--quiet` implies `--exit-code`: 0 = no differences, 1 = differences,
    // anything higher = git could not answer.
    expect(gate).toMatch(/EMPTY/);
    expect(gate).toMatch(/HAS_CONTENT/);
    expect(gate).toMatch(/DIFF_UNREADABLE/);
  });

  it('opens no PR when git could not answer, rather than assuming content', () => {
    // The two guesses are not symmetric. "Has content" here opens a PR carrying
    // `Closes #<ID>`, and an issue wrongly closed does not self-correct; a
    // withheld PR is re-found by the next run's stranded-branch rescue.
    const unreadable = gate.slice(
      gate.indexOf('**`DIFF_UNREADABLE`**'),
      gate.indexOf('**`EMPTY`**'),
    );
    expect(unreadable).toMatch(/do not guess/i);
    expect(unreadable).toMatch(/gh issue comment/);
    expect(unreadable).not.toMatch(/gh pr create/);
    // …and it must not label the issue: nothing has established a no-op, and the
    // label would drop the issue from the next run's plan on a git error.
    expect(unreadable).toMatch(/[Dd]o \*\*not\*\* apply the label/);
  });

  it('forbids opening a PR at all on the empty path', () => {
    expect(gate).toMatch(/do not[^.]*gh pr create/i);
    expect(gate).toMatch(/do not[^.]*push/i);
  });

  it('forbids writing the auto-closing keyword on the empty path', () => {
    expect(gate).toMatch(/do not write `?Closes #/i);
  });

  it('explains that a zero-change PR still merges and still auto-closes', () => {
    expect(gate).toMatch(/auto.?close/i);
  });

  it('comments on the issue instead of closing it', () => {
    expect(gateCommands).toMatch(/gh issue comment/);
    expect(gateCommands).not.toMatch(/gh issue close/);
    expect(gate).toMatch(/[Nn]ever `?gh issue close/);
  });

  it('says the issue is left open and why that is deliberate', () => {
    expect(gate).toMatch(/left open/i);
  });

  it('names what was attempted and undone, not "produced no changes"', () => {
    // The no-commits wording would read as "the agent did nothing" on a branch
    // that committed an approach and reverted it — same distinction NoOpReason
    // draws in sandcastle-noop-issues.mts.
    expect(gate).toMatch(/cancel out|revert/i);
  });

  it('applies the same marker label the execute phase uses', () => {
    expect(gate).toContain(NOOP_LABEL);
    expect(gate).toMatch(/gh issue edit <ID> --add-label/);
  });

  it('creates the label on first use, with the same colour and description', () => {
    // `gh issue edit --add-label` refuses a label that does not exist, and the
    // merge phase can be the first thing in a fresh repo to need it.
    expect(gate).toMatch(/gh label create/);
    expect(gate).toContain(NOOP_LABEL_COLOR);
    expect(gate).toContain(NOOP_LABEL_DESCRIPTION);
  });

  it('tells the human how to make the issue eligible again', () => {
    expect(gate).toMatch(/--remove-label/);
  });

  it('leaves the branch in place rather than deleting it', () => {
    // It holds the reverted attempt a human goes to read.
    expect(gate).toMatch(/leave the branch|branch in place|do not delete/i);
  });

  it('passes the comment body via --body-file, not an interpolated --body', () => {
    // The body is multi-line and contains backticks; neither survives
    // interpolation into a shell command intact.
    expect(gate).toMatch(/--body-file/);
  });

  it('moves on to the next pair rather than stopping the batch', () => {
    expect(gate).toMatch(/next (branch|pair)/i);
  });
});

describe('merge-prompt.md — the non-empty path is unchanged', () => {
  it('still requires Closes #<ID>, now scoped to a branch with content', () => {
    const rules = content.slice(
      content.indexOf('Body **must** contain'),
      content.indexOf('## Step 3'),
    );
    expect(rules).toMatch(/Closes #<ID>/);
    expect(rules).toMatch(/Step 1b|has content|non-empty/i);
  });
});
