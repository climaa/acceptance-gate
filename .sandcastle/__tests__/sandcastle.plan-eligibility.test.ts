import {
  classifyPlannedIssue,
  queuedBranchesFor,
} from '../sandcastle-plan-eligibility.mts';

/**
 * REAL unit tests for policy that used to live inline in main.mts, where the
 * only available check was a source-text assertion on statement order.
 *
 * Both decisions have a documented failure mode behind them:
 *   - Miss the no-op exclusion and a run spends a fresh sandbox on the same
 *     dead issue every iteration, up to MAX_ITERATIONS.
 *   - Miss the failed-branch exclusion and a branch whose build just failed
 *     gets rescued and merged in the same run — the build gate becomes
 *     advisory-only.
 */

const NOOP_LABEL = 'sandcastle:no-op';

describe('classifyPlannedIssue', () => {
  const none: ReadonlySet<string> = new Set();

  it('accepts a plain issue with no control labels', () => {
    // Arrange & Act
    const verdict = classifyPlannedIssue({ id: '1', labels: ['bug'], seenNoOpIds: none });

    // Assert
    expect(verdict).toEqual({ kind: 'accept', overrides: {} });
  });

  describe('no-op exclusion', () => {
    it('skips an issue carrying the durable no-op label', () => {
      // Arrange & Act
      const verdict = classifyPlannedIssue({
        id: '1',
        labels: [NOOP_LABEL],
        seenNoOpIds: none,
      });

      // Assert
      expect(verdict.kind).toBe('skip-noop');
    });

    it('skips an issue this run already saw produce nothing, even with no labels', () => {
      // Arrange — the run-scoped set is the half that still works when `gh` is
      // down and fetchIssue() returns null, leaving labels empty.
      const seenNoOpIds = new Set(['7']);

      // Act
      const verdict = classifyPlannedIssue({ id: '7', labels: [], seenNoOpIds });

      // Assert
      expect(verdict.kind).toBe('skip-noop');
    });

    it('does not skip a different issue in the same run', () => {
      // Arrange
      const seenNoOpIds = new Set(['7']);

      // Act
      const verdict = classifyPlannedIssue({ id: '8', labels: [], seenNoOpIds });

      // Assert
      expect(verdict.kind).toBe('accept');
    });

    it('prefers skipping over rejecting when both apply', () => {
      // Arrange — a no-op issue that ALSO carries a malformed override label
      // must skip quietly rather than abort the whole run.
      const labels = [NOOP_LABEL, 'sc:implementer:not-a-real-model'];

      // Act
      const verdict = classifyPlannedIssue({ id: '1', labels, seenNoOpIds: none });

      // Assert
      expect(verdict.kind).toBe('skip-noop');
    });
  });

  describe('override parsing', () => {
    it('carries a valid per-role override through', () => {
      // Arrange & Act
      const verdict = classifyPlannedIssue({
        id: '1',
        labels: ['sc:implementer:sonnet-5'],
        seenNoOpIds: none,
      });

      // Assert
      expect(verdict.kind).toBe('accept');
      if (verdict.kind !== 'accept') throw new Error('unreachable');
      expect(verdict.overrides.implementer).toBeDefined();
    });

    it('rejects rather than silently falling back on a malformed label', () => {
      // Arrange & Act — the whole point of the reject branch: a typo must never
      // degrade to "run it on the expensive default and say nothing".
      const verdict = classifyPlannedIssue({
        id: '1',
        labels: ['sc:implementer:nonsense-model'],
        seenNoOpIds: none,
      });

      // Assert
      expect(verdict.kind).toBe('reject');
      if (verdict.kind !== 'reject') throw new Error('unreachable');
      expect(verdict.errors.length).toBeGreaterThan(0);
    });

    it('ignores labels outside the sc: namespace', () => {
      // Arrange & Act
      const verdict = classifyPlannedIssue({
        id: '1',
        labels: ['bug', 'blocked', 'Sandcastle'],
        seenNoOpIds: none,
      });

      // Assert
      expect(verdict).toEqual({ kind: 'accept', overrides: {} });
    });
  });
});

describe('queuedBranchesFor', () => {
  it('excludes branches already queued for merge', () => {
    // Arrange & Act
    const queued = queuedBranchesFor(['sandcastle/issue-1-a'], []);

    // Assert
    expect(queued.has('sandcastle/issue-1-a')).toBe(true);
  });

  it('excludes branches whose pipeline failed this iteration', () => {
    // Arrange & Act — the load-bearing case. A just-failed pipeline leaves a
    // branch ahead of base with no PR, exactly what the rescue path hunts for.
    // Let it through and it merges in the same run its build failed.
    const queued = queuedBranchesFor([], ['sandcastle/issue-2-broken']);

    // Assert
    expect(queued.has('sandcastle/issue-2-broken')).toBe(true);
  });

  it('excludes both kinds at once', () => {
    // Arrange & Act
    const queued = queuedBranchesFor(
      ['sandcastle/issue-1-a'],
      ['sandcastle/issue-2-broken'],
    );

    // Assert
    expect(queued.has('sandcastle/issue-1-a')).toBe(true);
    expect(queued.has('sandcastle/issue-2-broken')).toBe(true);
    expect(queued.size).toBe(2);
  });

  it('does not exclude an unrelated stranded branch', () => {
    // Arrange & Act
    const queued = queuedBranchesFor(
      ['sandcastle/issue-1-a'],
      ['sandcastle/issue-2-broken'],
    );

    // Assert
    expect(queued.has('sandcastle/issue-3-stranded')).toBe(false);
  });

  it('deduplicates a branch that is both completed and failed', () => {
    // Arrange & Act
    const queued = queuedBranchesFor(['sandcastle/issue-1-a'], ['sandcastle/issue-1-a']);

    // Assert
    expect(queued.size).toBe(1);
  });

  it('is empty when nothing ran', () => {
    // Arrange & Act & Assert
    expect(queuedBranchesFor([], []).size).toBe(0);
  });
});
