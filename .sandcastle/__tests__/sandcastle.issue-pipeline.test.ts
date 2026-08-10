import {
  formatIssueSummary,
  formatUnresolvedSummary,
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
    // Arrange & Act & Assert
    expect(shouldReview(NO)).toBe(false);
  });

  it('reviews the ordinary path: the implementer committed', () => {
    // Arrange & Act & Assert
    expect(shouldReview({ ...NO, implementCommitCount: 3 })).toBe(true);
  });

  it('reviews the salvage path even with zero counted commits', () => {
    // Arrange & Act & Assert — the implementer threw but the branch already had
    // commits: work exists, only the completion signal was lost. Reviewing is
    // how it gets salvaged.
    expect(shouldReview({ ...NO, salvaged: true })).toBe(true);
  });

  it('reviews when only the branch is ahead of base', () => {
    // Arrange & Act & Assert — an idempotent implementer that sees the work
    // already done returns 0 commits. Without this term the merge phase is
    // skipped forever.
    expect(shouldReview({ ...NO, branchAhead: true })).toBe(true);
  });

  it('reviews when every reason applies at once', () => {
    // Arrange
    const every = { salvaged: true, implementCommitCount: 2, branchAhead: true };

    // Act & Assert
    expect(shouldReview(every)).toBe(true);
  });

  it('treats a negative commit count as no reason to review', () => {
    // Arrange & Act & Assert
    expect(shouldReview({ ...NO, implementCommitCount: -1 })).toBe(false);
  });
});

describe('mergeCommitLists', () => {
  it('concatenates implement commits before review commits', () => {
    // Arrange & Act
    const merged = mergeCommitLists(['a', 'b'], ['c']);

    // Assert
    expect(merged).toEqual(['a', 'b', 'c']);
  });

  it('handles the salvage path, where implement commits are undefined', () => {
    // Arrange & Act — the salvage path never returns an implementer result
    // object, so the caller passes undefined. Dropping commits here loses them
    // from the PR body.
    const merged = mergeCommitLists(undefined, ['c']);

    // Assert
    expect(merged).toEqual(['c']);
  });

  it('handles a review that produced nothing', () => {
    // Arrange & Act & Assert
    expect(mergeCommitLists(['a'], [])).toEqual(['a']);
  });

  it('returns empty when neither run committed', () => {
    // Arrange & Act & Assert
    expect(mergeCommitLists(undefined, [])).toEqual([]);
  });

  it('does not mutate either input', () => {
    // Arrange
    const implement = ['a'];
    const review = ['b'];

    // Act
    mergeCommitLists(implement, review);

    // Assert
    expect(implement).toEqual(['a']);
    expect(review).toEqual(['b']);
  });
});

describe('formatIssueSummary', () => {
  it('renders the per-issue cost record', () => {
    // Arrange
    const parts = {
      id: '42',
      implement: '1m 03s',
      build: 'build 12s (3/5 cached)',
      review: '8s',
    };

    // Act
    const line = formatIssueSummary(parts);

    // Assert
    expect(line).toBe(
      '[summary] issue #42: implement 1m 03s | build 12s (3/5 cached) | review 8s',
    );
  });

  it('renders the docs-only path, where the build was skipped', () => {
    // Arrange
    const parts = { id: '7', implement: '30s', build: 'build skipped', review: '5s' };

    // Act
    const line = formatIssueSummary(parts);

    // Assert
    expect(line).toBe('[summary] issue #7: implement 30s | build skipped | review 5s');
  });
});

describe('formatUnresolvedSummary', () => {
  it('returns null when every planned issue resolved', () => {
    // Arrange & Act & Assert
    expect(formatUnresolvedSummary([])).toBeNull();
  });

  it('names a pipeline that failed after retries were exhausted, by id and branch', () => {
    // Arrange
    const unresolved = [
      { id: '97', branch: 'sandcastle/issue-97-x', reason: 'pipeline failed' },
    ];

    // Act
    const summary = formatUnresolvedSummary(unresolved);

    // Assert — a planned issue must never be absent from the log with no
    // trace at all.
    expect(summary).toContain('1 planned issue(s)');
    expect(summary).toContain('#97 (sandcastle/issue-97-x) — pipeline failed');
  });

  it('names an issue that was never attempted (e.g. shutdown mid-iteration)', () => {
    // Arrange
    const unresolved = [
      {
        id: '12',
        branch: 'sandcastle/issue-12-x',
        reason: 'not attempted (shutdown requested)',
      },
    ];

    // Act
    const summary = formatUnresolvedSummary(unresolved);

    // Assert
    expect(summary).toContain(
      '#12 (sandcastle/issue-12-x) — not attempted (shutdown requested)',
    );
  });

  it('lists every unresolved issue, not just the first', () => {
    // Arrange
    const unresolved = [
      { id: '1', branch: 'sandcastle/issue-1-x', reason: 'pipeline failed' },
      { id: '2', branch: 'sandcastle/issue-2-x', reason: 'pipeline failed' },
    ];

    // Act
    const summary = formatUnresolvedSummary(unresolved);

    // Assert
    expect(summary).toContain('2 planned issue(s)');
    expect(summary).toContain('#1 (sandcastle/issue-1-x)');
    expect(summary).toContain('#2 (sandcastle/issue-2-x)');
  });
});
