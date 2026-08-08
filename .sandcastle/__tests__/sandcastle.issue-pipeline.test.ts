import {
  formatIssueSummary,
  mergeCommitLists,
  shouldReview,
} from '../sandcastle-issue-pipeline.mts';

/**
 * REAL unit tests for the branching inside runIssue(), which was 131 lines and
 * the only production function in fallow's >60 LOC "very high risk" band.
 *
 * shouldReview() is the one that matters. Two of its three terms exist because
 * of specific production failures: dropping `salvaged` discards real committed
 * work when an agent idles without signalling, and dropping `branchAhead`
 * means an idempotent implementer that finds the job already done reports zero
 * commits and the branch never reaches the merge phase — forever.
 */

describe('shouldReview', () => {
  const NO = { salvaged: false, implementCommitCount: 0, branchAhead: false };

  it('does not review when the implementer produced nothing and the branch is level', () => {
    expect(shouldReview(NO)).toBe(false);
  });

  it('reviews the ordinary path: the implementer committed', () => {
    expect(shouldReview({ ...NO, implementCommitCount: 3 })).toBe(true);
  });

  // The implementer threw but the branch already had commits: work exists, only
  // the completion signal was lost. Reviewing is how it gets salvaged.
  it('reviews the salvage path even with zero counted commits', () => {
    expect(shouldReview({ ...NO, salvaged: true })).toBe(true);
  });

  // An idempotent implementer that sees the work already done returns 0
  // commits. Without this term the merge phase is skipped forever.
  it('reviews when only the branch is ahead of base', () => {
    expect(shouldReview({ ...NO, branchAhead: true })).toBe(true);
  });

  it('reviews when every reason applies at once', () => {
    expect(
      shouldReview({ salvaged: true, implementCommitCount: 2, branchAhead: true }),
    ).toBe(true);
  });

  it('treats a negative commit count as no reason to review', () => {
    expect(shouldReview({ ...NO, implementCommitCount: -1 })).toBe(false);
  });
});

describe('mergeCommitLists', () => {
  it('concatenates implement commits before review commits', () => {
    expect(mergeCommitLists(['a', 'b'], ['c'])).toEqual(['a', 'b', 'c']);
  });

  // The salvage path never returns an implementer result object, so the caller
  // passes undefined. Dropping commits here loses them from the PR body.
  it('handles the salvage path, where implement commits are undefined', () => {
    expect(mergeCommitLists(undefined, ['c'])).toEqual(['c']);
  });

  it('handles a review that produced nothing', () => {
    expect(mergeCommitLists(['a'], [])).toEqual(['a']);
  });

  it('returns empty when neither run committed', () => {
    expect(mergeCommitLists(undefined, [])).toEqual([]);
  });

  it('does not mutate either input', () => {
    const implement = ['a'];
    const review = ['b'];
    mergeCommitLists(implement, review);
    expect(implement).toEqual(['a']);
    expect(review).toEqual(['b']);
  });
});

describe('formatIssueSummary', () => {
  it('renders the per-issue cost record', () => {
    expect(
      formatIssueSummary({
        id: '42',
        implement: '1m 03s',
        build: 'build 12s (3/5 cached)',
        review: '8s',
      }),
    ).toBe('[summary] issue #42: implement 1m 03s | build 12s (3/5 cached) | review 8s');
  });

  it('renders the docs-only path, where the build was skipped', () => {
    expect(
      formatIssueSummary({
        id: '7',
        implement: '30s',
        build: 'build skipped',
        review: '5s',
      }),
    ).toBe('[summary] issue #7: implement 30s | build skipped | review 5s');
  });
});
