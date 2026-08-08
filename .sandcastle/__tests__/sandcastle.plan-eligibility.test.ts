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
    const v = classifyPlannedIssue({ id: '1', labels: ['bug'], seenNoOpIds: none });
    expect(v).toEqual({ kind: 'accept', overrides: {} });
  });

  describe('no-op exclusion', () => {
    it('skips an issue carrying the durable no-op label', () => {
      const v = classifyPlannedIssue({
        id: '1',
        labels: [NOOP_LABEL],
        seenNoOpIds: none,
      });
      expect(v.kind).toBe('skip-noop');
    });

    // The run-scoped set is the half that still works when `gh` is down and
    // fetchIssue() returns null, leaving labels empty.
    it('skips an issue this run already saw produce nothing, even with no labels', () => {
      const v = classifyPlannedIssue({
        id: '7',
        labels: [],
        seenNoOpIds: new Set(['7']),
      });
      expect(v.kind).toBe('skip-noop');
    });

    it('does not skip a different issue in the same run', () => {
      const v = classifyPlannedIssue({
        id: '8',
        labels: [],
        seenNoOpIds: new Set(['7']),
      });
      expect(v.kind).toBe('accept');
    });

    // Ordering matters: a no-op issue that ALSO carries a malformed override
    // label must skip quietly rather than abort the whole run.
    it('prefers skipping over rejecting when both apply', () => {
      const v = classifyPlannedIssue({
        id: '1',
        labels: [NOOP_LABEL, 'sc:implementer:not-a-real-model'],
        seenNoOpIds: none,
      });
      expect(v.kind).toBe('skip-noop');
    });
  });

  describe('override parsing', () => {
    it('carries a valid per-role override through', () => {
      const v = classifyPlannedIssue({
        id: '1',
        labels: ['sc:implementer:sonnet-5'],
        seenNoOpIds: none,
      });
      expect(v.kind).toBe('accept');
      if (v.kind !== 'accept') throw new Error('unreachable');
      expect(v.overrides.implementer).toBeDefined();
    });

    // The whole point of the reject branch: a typo must never degrade to "run
    // it on the expensive default and say nothing".
    it('rejects rather than silently falling back on a malformed label', () => {
      const v = classifyPlannedIssue({
        id: '1',
        labels: ['sc:implementer:nonsense-model'],
        seenNoOpIds: none,
      });
      expect(v.kind).toBe('reject');
      if (v.kind !== 'reject') throw new Error('unreachable');
      expect(v.errors.length).toBeGreaterThan(0);
    });

    it('ignores labels outside the sc: namespace', () => {
      const v = classifyPlannedIssue({
        id: '1',
        labels: ['bug', 'blocked', 'Sandcastle'],
        seenNoOpIds: none,
      });
      expect(v).toEqual({ kind: 'accept', overrides: {} });
    });
  });
});

describe('queuedBranchesFor', () => {
  it('excludes branches already queued for merge', () => {
    const s = queuedBranchesFor(['sandcastle/issue-1-a'], []);
    expect(s.has('sandcastle/issue-1-a')).toBe(true);
  });

  // The load-bearing case. A just-failed pipeline leaves a branch ahead of base
  // with no PR — exactly what the rescue path hunts for. Let it through and it
  // merges in the same run its build failed.
  it('excludes branches whose pipeline failed this iteration', () => {
    const s = queuedBranchesFor([], ['sandcastle/issue-2-broken']);
    expect(s.has('sandcastle/issue-2-broken')).toBe(true);
  });

  it('excludes both kinds at once', () => {
    const s = queuedBranchesFor(['sandcastle/issue-1-a'], ['sandcastle/issue-2-broken']);
    expect(s.has('sandcastle/issue-1-a')).toBe(true);
    expect(s.has('sandcastle/issue-2-broken')).toBe(true);
    expect(s.size).toBe(2);
  });

  it('does not exclude an unrelated stranded branch', () => {
    const s = queuedBranchesFor(['sandcastle/issue-1-a'], ['sandcastle/issue-2-broken']);
    expect(s.has('sandcastle/issue-3-stranded')).toBe(false);
  });

  it('deduplicates a branch that is both completed and failed', () => {
    const s = queuedBranchesFor(['sandcastle/issue-1-a'], ['sandcastle/issue-1-a']);
    expect(s.size).toBe(1);
  });

  it('is empty when nothing ran', () => {
    expect(queuedBranchesFor([], []).size).toBe(0);
  });
});
