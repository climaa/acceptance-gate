import {
  NOOP_LABEL,
  hasNoOpLabel,
  noOpIssueComment,
  partitionOutcomes,
  strandedDisposition,
} from '../sandcastle-noop-issues.mts';
import { LABEL_PREFIX, parseOverrideLabels } from '../sandcastle-model-overrides.mts';
import { read } from './helpers';

/**
 * REAL unit tests (plus one source-text block for the orchestrator wiring,
 * which no unit test can observe) — sandcastle-noop-issues.mts imports nothing
 * from this directory, for the same reason as sandcastle-model-overrides.mts and
 * sandcastle-worktree-safety.mts: sandcastle-config.mts has import-time side
 * effects, so anything that transitively pulls it in cannot be loaded here.
 *
 * What is being protected: an implementer that finds nothing to do signals
 * completion without committing. Before this partition existed, that issue
 * stayed eligible for the next iteration's plan, so the run spun a fresh
 * sandbox on it every iteration up to MAX_ITERATIONS. The classification is
 * the whole fix — misfiling a crash as a no-op would silently retire an issue
 * that was never attempted.
 */

const issue = (id: string) => ({ id, title: `issue ${id}`, branch: `b-${id}` });

describe('partitionOutcomes', () => {
  it('files a run that produced commits under completed', () => {
    // Arrange
    const a = issue('1');

    // Act
    const { completed, noop, failed } = partitionOutcomes([
      {
        issue: a,
        status: 'fulfilled',
        commitCount: 3,
        branchAhead: true,
        diffEmpty: false,
      },
    ]);

    // Assert
    expect(completed).toEqual([a]);
    expect(noop).toEqual([]);
    expect(failed).toEqual([]);
  });

  it('files a run whose commits net to an empty diff under noop, not completed', () => {
    // The add-then-revert pair: the implementer committed an approach, found it
    // wrong and reverted it in the same branch. `commitCount` and `branchAhead`
    // both say "there is work here"; the net diff says there is nothing to
    // land. Filed as completed it reaches a merger with nothing to merge, and
    // is found again — with no PR to exclude it — every iteration after that.
    // Arrange
    const a = issue('233');

    // Act
    const { completed, noop, failed } = partitionOutcomes([
      {
        issue: a,
        status: 'fulfilled',
        commitCount: 2,
        branchAhead: true,
        diffEmpty: true,
      },
    ]);

    // Assert
    expect(noop).toEqual([{ issue: a, reason: 'empty-diff' }]);
    expect(completed).toEqual([]);
    expect(failed).toEqual([]);
  });

  it('files a fulfilled run with no commits and no branch ahead under noop', () => {
    // Arrange
    const a = issue('14');

    // Act
    const { completed, noop, failed } = partitionOutcomes([
      {
        issue: a,
        status: 'fulfilled',
        commitCount: 0,
        branchAhead: false,
        diffEmpty: true,
      },
    ]);

    // Assert
    expect(noop).toEqual([{ issue: a, reason: 'no-commits' }]);
    expect(completed).toEqual([]);
    expect(failed).toEqual([]);
  });

  it('files an idempotent re-run (0 commits, branch already ahead) under completed', () => {
    // A prior iteration committed the work; this run correctly did nothing.
    // That is NOT a no-op — the branch still has to reach the merge phase.
    // Arrange
    const a = issue('7');

    // Act
    const { completed, noop } = partitionOutcomes([
      {
        issue: a,
        status: 'fulfilled',
        commitCount: 0,
        branchAhead: true,
        diffEmpty: false,
      },
    ]);

    // Assert
    expect(completed).toEqual([a]);
    expect(noop).toEqual([]);
  });

  it('keeps a branch whose diff could not be read under completed', () => {
    // `diffEmpty: false` is what the caller reports when git could not answer
    // (the probe errored, or the branch is absent). Unknown must never retire
    // an issue durably — the same F9 rule the commits-ahead probe follows.
    // Arrange
    const a = issue('11');

    // Act
    const { completed, noop } = partitionOutcomes([
      {
        issue: a,
        status: 'fulfilled',
        commitCount: 2,
        branchAhead: true,
        diffEmpty: false,
      },
    ]);

    // Assert
    expect(completed).toEqual([a]);
    expect(noop).toEqual([]);
  });

  it('files a thrown pipeline under failed, never under noop', () => {
    // A crash produces no commits too, but it means "not attempted
    // successfully" — marking it handled would retire unstarted work.
    // Arrange
    const a = issue('9');

    // Act
    const { failed, noop, completed } = partitionOutcomes([
      {
        issue: a,
        status: 'rejected',
        commitCount: 0,
        branchAhead: false,
        diffEmpty: false,
      },
    ]);

    // Assert
    expect(failed).toEqual([a]);
    expect(noop).toEqual([]);
    expect(completed).toEqual([]);
  });

  it('files a thrown pipeline whose branch is ahead under failed, not completed', () => {
    // Build-gate hardening: a branch left ahead of base by a pipeline that
    // threw must not reach the merger in the same run it failed.
    // Arrange
    const a = issue('9');

    // Act
    const { failed, completed } = partitionOutcomes([
      {
        issue: a,
        status: 'rejected',
        commitCount: 4,
        branchAhead: true,
        diffEmpty: false,
      },
    ]);

    // Assert
    expect(failed).toEqual([a]);
    expect(completed).toEqual([]);
  });

  it('files a thrown pipeline whose diff is empty under failed, never under noop', () => {
    // Same rule as above from the other side: an empty diff on a pipeline that
    // threw says nothing about whether the issue was attempted successfully.
    // Arrange
    const a = issue('9');

    // Act
    const { failed, noop, completed } = partitionOutcomes([
      {
        issue: a,
        status: 'rejected',
        commitCount: 4,
        branchAhead: true,
        diffEmpty: true,
      },
    ]);

    // Assert
    expect(failed).toEqual([a]);
    expect(noop).toEqual([]);
    expect(completed).toEqual([]);
  });

  it('splits a mixed batch and preserves input order within each bucket', () => {
    // Arrange
    const [a, b, c, d, e] = [issue('1'), issue('2'), issue('3'), issue('4'), issue('5')];

    // Act
    const { completed, noop, failed } = partitionOutcomes([
      {
        issue: a,
        status: 'fulfilled',
        commitCount: 1,
        branchAhead: true,
        diffEmpty: false,
      },
      {
        issue: b,
        status: 'fulfilled',
        commitCount: 0,
        branchAhead: false,
        diffEmpty: true,
      },
      {
        issue: c,
        status: 'rejected',
        commitCount: 0,
        branchAhead: false,
        diffEmpty: false,
      },
      {
        issue: d,
        status: 'fulfilled',
        commitCount: 0,
        branchAhead: false,
        diffEmpty: true,
      },
      {
        issue: e,
        status: 'fulfilled',
        commitCount: 5,
        branchAhead: true,
        diffEmpty: true,
      },
    ]);

    // Assert
    expect(completed).toEqual([a]);
    expect(noop).toEqual([
      { issue: b, reason: 'no-commits' },
      { issue: d, reason: 'no-commits' },
      { issue: e, reason: 'empty-diff' },
    ]);
    expect(failed).toEqual([c]);
  });

  it('returns three empty buckets for an empty batch', () => {
    // Arrange & Act
    const partitioned = partitionOutcomes([]);

    // Assert
    expect(partitioned).toEqual({ completed: [], noop: [], failed: [] });
  });
});

describe('hasNoOpLabel', () => {
  it('detects the marker among unrelated labels', () => {
    // Arrange & Act & Assert
    expect(hasNoOpLabel(['bug', NOOP_LABEL, 'sc:reviewer:sonnet-5'])).toBe(true);
  });

  it('is false when the marker is absent', () => {
    // Arrange & Act & Assert
    expect(hasNoOpLabel(['bug', 'enhancement'])).toBe(false);
  });

  it('does not match a label that merely contains the marker', () => {
    // Arrange & Act & Assert
    expect(hasNoOpLabel([`${NOOP_LABEL}-candidate`])).toBe(false);
  });

  it('is false for an issue with no labels', () => {
    // Arrange & Act & Assert
    expect(hasNoOpLabel([])).toBe(false);
  });
});

describe('NOOP_LABEL', () => {
  it('does not use the sc: control prefix', () => {
    // Arrange & Act & Assert
    expect(NOOP_LABEL.startsWith(LABEL_PREFIX)).toBe(false);
  });

  it('is ignored by the model-override parser rather than rejected', () => {
    // An `sc:`-prefixed marker would parse as a control label with an unknown
    // role, and main.mts throws on any override error — so marking an issue
    // would abort the very next run before a sandbox started.
    // Arrange & Act
    const { overrides, errors } = parseOverrideLabels([NOOP_LABEL]);

    // Assert
    expect(errors).toEqual([]);
    expect(overrides).toEqual({});
  });
});

describe('noOpIssueComment', () => {
  const body = noOpIssueComment({
    id: '14',
    branch: 'sandcastle/issue-14-ci-badge',
    iteration: 2,
    reason: 'no-commits',
  });

  it('names the branch it inspected', () => {
    expect(body).toContain('sandcastle/issue-14-ci-badge');
  });

  it('says the agent signalled completion without producing commits', () => {
    expect(body).toMatch(/no commits/i);
  });

  it('states the issue was deliberately left open for a human', () => {
    // The issue may mean "already done" OR "the agent misread the task";
    // auto-closing would hide the second case.
    expect(body).toMatch(/left open/i);
    expect(body).toMatch(/misread/i);
  });

  it('gives the exact command that makes the issue eligible again', () => {
    expect(body).toContain(`gh issue edit 14 --remove-label "${NOOP_LABEL}"`);
  });

  it('never claims the issue is resolved', () => {
    expect(body).not.toMatch(/\bclos(ed|ing)\b/i);
  });
});

describe('noOpIssueComment — empty-diff variant', () => {
  const body = noOpIssueComment({
    id: '233',
    branch: 'sandcastle/issue-233-ruleset-drift-check',
    iteration: 2,
    reason: 'empty-diff',
  });

  it('says commits were produced, not that nothing ran', () => {
    // The no-commits wording is inaccurate here and reads as "the agent did
    // nothing" to whoever finds the issue later — when in fact an approach was
    // implemented and then deliberately reverted.
    expect(body).not.toMatch(/with no commits/i);
    expect(body).toMatch(/commits/i);
    expect(body).toMatch(/revert/i);
  });

  it('names the empty net diff against the base branch as the finding', () => {
    expect(body).toMatch(/net diff/i);
    expect(body).toMatch(/empty/i);
  });

  it('names the branch it inspected', () => {
    expect(body).toContain('sandcastle/issue-233-ruleset-drift-check');
  });

  it('states the issue was deliberately left open for a human', () => {
    expect(body).toMatch(/left open/i);
  });

  it('gives the exact command that makes the issue eligible again', () => {
    expect(body).toContain(`gh issue edit 233 --remove-label "${NOOP_LABEL}"`);
  });

  it('never claims the issue is resolved', () => {
    expect(body).not.toMatch(/\bclos(ed|ing)\b/i);
  });
});

describe('strandedDisposition', () => {
  it('rescues a branch that carries real content', () => {
    // Arrange & Act & Assert
    expect(strandedDisposition({ diffEmpty: false, labels: [] })).toBe('rescue');
  });

  it('retires a branch whose commits net to an empty diff', () => {
    // Nothing upstream will mark it: the pipeline that produced it never
    // finished (crash recovery is the only way an empty-diff branch reaches the
    // rescue path at all), so this is the last chance to record it.
    // Arrange & Act & Assert
    expect(strandedDisposition({ diffEmpty: true, labels: ['bug'] })).toBe('retire');
  });

  it('does not re-retire a branch whose issue already carries the marker', () => {
    // The duplicate-comment guard: rescue runs once per iteration, so marking
    // an already-marked issue posts one more near-identical comment per
    // iteration until MAX_ITERATIONS.
    // Arrange & Act & Assert
    expect(strandedDisposition({ diffEmpty: true, labels: ['bug', NOOP_LABEL] })).toBe(
      'already-retired',
    );
  });

  it('still rescues a marked issue whose branch has real content', () => {
    // The marker is a record of a past run, not a permanent ban: a human who
    // pushed a fix to the branch (or removed the label later) must not lose it.
    // Arrange & Act & Assert
    expect(strandedDisposition({ diffEmpty: false, labels: [NOOP_LABEL] })).toBe(
      'rescue',
    );
  });
});

describe('orchestrator wiring (source-text — not observable from a unit test)', () => {
  const main = read('main.mts');
  const git = read('sandcastle-git.mts');
  const planPrompt = read('agent-docs/plan-prompt.md');

  it('main.mts partitions pipeline outcomes through the pure module', () => {
    // `[^}]*` keeps the match inside a single import statement — `[\s\S]*?`
    // would happily span from an earlier import to this module's from-clause.
    expect(main).toMatch(
      /import \{[^}]*partitionOutcomes[^}]*\} from ["']\.\/sandcastle-noop-issues\.mts["']/,
    );
    expect(main).toMatch(/partitionOutcomes\(/);
  });

  it('main.mts keeps the no-op set across iterations, not per iteration', () => {
    // Declared inside the loop it would reset every iteration and the issue
    // would be re-planned exactly as before.
    const setIdx = main.indexOf('const noOpIssueIds = new Set');
    const loopIdx = main.indexOf('for (let iteration');
    expect(setIdx).toBeGreaterThan(-1);
    expect(setIdx).toBeLessThan(loopIdx);
  });

  // The no-op check itself moved into classifyPlannedIssue()
  // (sandcastle-plan-eligibility.mts) where it is unit-tested. The ordering is
  // the part only source text can see, and it is the part that matters: run the
  // filter after runIssue() and the sandbox has already been spent.
  it('main.mts drops marked issues from the plan before any sandbox is created', () => {
    // The eligibility screen (screenPlan, sandcastle-orchestrator.mts) must run
    // before the execute loop, or a sandbox is spent on an ineligible issue.
    const filterIdx = main.indexOf('screenPlan(');
    const runIssueIdx = main.indexOf('await runIssue(');
    expect(filterIdx).toBeGreaterThan(-1);
    expect(runIssueIdx).toBeGreaterThan(-1);
    expect(filterIdx).toBeLessThan(runIssueIdx);
  });

  it('main.mts marks no-op issues after execution', () => {
    expect(main).toMatch(/markIssueNoOp\(/);
  });

  it('main.mts records a non-zero exit when a pipeline failed, via the failed bucket', () => {
    // `failed` is partitionOutcomes' bucket of thrown pipelines; a run with any
    // failure must not report success (exit 0). Guards B3 at the source level
    // until the loop is decomposed (EPIC C). No-ops/host-push warnings stay
    // warnings, so the condition is `failed.length`, not any error at all.
    expect(main).toMatch(/if \(failed\.length > 0\)\s*\{?\s*process\.exitCode = 1/);
  });

  it('main.mts never closes an issue', () => {
    expect(main).not.toMatch(/gh issue close/);
  });

  it('sandcastle-git.mts passes the comment body on stdin, not in the shell command', () => {
    // A body interpolated into an execSync string is a quoting bug waiting to
    // happen (backticks, quotes, newlines all come from a template).
    expect(git).toMatch(/gh issue comment \$\{id\} --body-file -/);
    expect(git).toMatch(/input: body/);
  });

  it('the planner is told to skip issues carrying the marker', () => {
    expect(planPrompt).toContain(NOOP_LABEL);
  });
});
