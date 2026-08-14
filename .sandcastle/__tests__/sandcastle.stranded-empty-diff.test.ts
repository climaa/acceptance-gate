import { NOOP_LABEL } from '../sandcastle-noop-issues.mts';
import { read, stripComments } from './helpers';

/**
 * Source-text guards for the empty-diff exit from the rescue path.
 *
 * The decisions themselves are pure and unit-tested (strandedDisposition,
 * partitionOutcomes, noOpIssueComment in sandcastle.noop-issues.test.ts).
 * What no unit test can observe is the wiring: collectStrandedIssues() shells
 * out to git and gh against the real checkout, so the only thing left to pin
 * here is that the decision is consulted at all, on both call sites, and that
 * the branch retires instead of being handed to the merger.
 *
 * The failure being guarded: a branch whose commits net to an empty diff passes
 * every existing filter — commits ahead (a count, not a diff), issue open, no
 * open PR (nothing opened a PR for an empty diff) — so it is rescued, trivially
 * "passes" build-verify (an empty diff reads as docs-only), reaches a merger
 * with nothing to merge, and is found again on the next iteration, unchanged
 * and unmarked, until the run hits MAX_ITERATIONS.
 */

const stranded = read('sandcastle-stranded-branches.mts');
const strandedCode = stripComments(stranded);
const main = read('main.mts');

describe('rescue path — branches whose commits net to an empty diff', () => {
  it('checks the branch diff alongside the commit count, not instead of it', () => {
    // Both questions still have to be asked: the commit count is what makes a
    // branch a rescue candidate, the diff is what decides it has content.
    expect(strandedCode).toMatch(/branchHasCommitsAhead\(/);
    expect(strandedCode).toMatch(/branchDiffIsEmpty\(/);
  });

  it('routes the branch through the pure disposition rule', () => {
    expect(stranded).toMatch(
      /import \{[^}]*strandedDisposition[^}]*\} from ["']\.\/sandcastle-noop-issues\.mts["']/,
    );
    expect(strandedCode).toMatch(/strandedDisposition\(/);
  });

  it('marks the issue rather than only skipping the branch', () => {
    // Option (b) with marking: partitionOutcomes already retires this shape on
    // the iteration that produced it, so a branch reaching the rescue path with
    // an empty diff means nothing upstream ever got to mark it. Skipping
    // silently would leave no record for a human and no marker to stop the next
    // run rescuing it again.
    expect(strandedCode).toMatch(/markIssueNoOp\(/);
    expect(strandedCode).toMatch(/reason: ["']empty-diff["']/);
  });

  it('does not comment again on an issue that already carries the marker', () => {
    expect(strandedCode).toMatch(/already-retired/);
  });

  it('excludes the branch from the rescued list', () => {
    // The disposition check must `continue` before the push, or the branch is
    // build-verified and merged exactly as before.
    const dispositionIdx = strandedCode.indexOf('strandedDisposition(');
    const pushIdx = strandedCode.indexOf('stranded.push(');
    expect(dispositionIdx).toBeGreaterThan(-1);
    expect(pushIdx).toBeGreaterThan(dispositionIdx);
    expect(strandedCode.slice(dispositionIdx, pushIdx)).toMatch(/continue;/);
  });

  it('keeps the open-PR skip ahead of the retirement', () => {
    // A branch with an open PR belongs to the merger, marked or not — retiring
    // its issue would contradict a PR that is still in flight.
    const prIdx = strandedCode.indexOf('branchHasOpenPr(');
    const dispositionIdx = strandedCode.indexOf('strandedDisposition(');
    expect(prIdx).toBeGreaterThan(-1);
    expect(prIdx).toBeLessThan(dispositionIdx);
  });
});

describe('main.mts wiring', () => {
  it('probes diff emptiness for every pipeline outcome it partitions', () => {
    expect(main).toMatch(
      /import \{[^}]*probeBranchDiffEmpty[^}]*\} from ["']\.\/sandcastle-git\.mts["']/,
    );
    const partitionIdx = main.indexOf('partitionOutcomes(');
    const probeIdx = main.indexOf('probeBranchDiffEmpty(', partitionIdx);
    expect(probeIdx).toBeGreaterThan(partitionIdx);
  });

  it('passes the iteration number to both rescue call sites', () => {
    // The retirement comment is stamped with the iteration, exactly like the
    // one partitionOutcomes' no-ops get.
    expect(main).toMatch(/collectStrandedIssues\(new Set\(\), iteration\)/);
    expect(main).toMatch(/collectStrandedIssues\(queuedBranches, iteration\)/);
  });

  it('carries the no-op reason from the partition into the comment', () => {
    // If `reason` is dropped on the way through, both shapes fall back to the
    // no-commits wording — which reads as "the agent did nothing" on a branch
    // that committed an approach and reverted it.
    expect(main).toMatch(/noOpIssueComment\(\{[^}]*reason[^}]*\}\)/);
  });

  it('still never closes an issue on either path', () => {
    expect(main).not.toMatch(/gh issue close/);
    expect(strandedCode).not.toMatch(/gh issue close/);
  });

  it('uses the same marker label as the per-iteration no-op path', () => {
    // Asserted against the stripped source: a comment naming the constant must
    // not stand in for the code importing and logging it.
    expect(strandedCode).toMatch(/NOOP_LABEL/);
    expect(NOOP_LABEL).toBe('sandcastle:no-op');
  });
});
