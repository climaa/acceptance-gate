import { execSync } from 'node:child_process';
import * as git from '../sandcastle-git.mts';
import { collectStrandedIssues } from '../sandcastle-stranded-branches.mts';
import { HOLD_LABEL } from '../sandcastle-noop-issues.mts';

/**
 * The rescue path re-pushed a branch whose issue a human had put back on hold.
 * The planner never dispatches a `sandcastle:hold` issue (plan-prompt.md, HELD
 * ISSUES); the rescue did, through its branch — once per run, for as long as
 * the branch existed (climaa/torn #307).
 *
 * Real calls into collectStrandedIssues: git and gh are the only things mocked,
 * so what is asserted is what the rescue does, not what its source looks like.
 */

vi.mock('node:child_process', () => ({ execSync: vi.fn() }));
vi.mock('../sandcastle-git.mts', () => ({
  branchDiffIsEmpty: vi.fn(() => false),
  branchHasCommitsAhead: vi.fn(() => true),
  branchHasOpenPr: vi.fn(() => false),
  fetchIssue: vi.fn(),
  findWorktreeForBranch: vi.fn(() => null),
  listSandcastleBranches: vi.fn(),
  markIssueNoOp: vi.fn(() => ({ commented: true, labeled: true })),
  parseIssueIdFromBranch: vi.fn(
    (branch: string) => /issue-(\d+)/.exec(branch)?.[1] ?? null,
  ),
  worktreeReapBlockerFor: vi.fn(() => null),
}));

const BRANCH = 'sandcastle/issue-307-host-push';

function strandOpenIssue(labels: string[]): void {
  vi.mocked(git.listSandcastleBranches).mockReturnValue([BRANCH]);
  vi.mocked(git.fetchIssue).mockReturnValue({
    title: 'host push',
    state: 'OPEN',
    labels,
  } as ReturnType<typeof git.fetchIssue>);
}

describe('stranded rescue — an issue on sandcastle:hold', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(git.branchDiffIsEmpty).mockReturnValue(false);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('is not rescued, and the log says why', () => {
    // Arrange
    strandOpenIssue([HOLD_LABEL]);

    // Act
    const stranded = collectStrandedIssues(new Set(), 1);

    // Assert
    expect(stranded).toEqual([]);
    const logged = [
      ...vi.mocked(console.log).mock.calls,
      ...vi.mocked(console.warn).mock.calls,
    ].flat();
    expect(logged).toContainEqual(
      expect.stringContaining(`skipping stranded branch ${BRANCH}: #307 is on hold`),
    );
  });

  it('is rescued as before once the label is gone', () => {
    // Arrange
    strandOpenIssue(['sc:implementer:effort:medium']);

    // Act
    const stranded = collectStrandedIssues(new Set(), 1);

    // Assert
    expect(stranded).toHaveLength(1);
    expect(stranded[0]).toMatchObject({ id: '307', branch: BRANCH });
  });

  it('leaves the branch in place: nothing deleted, reaped or marked', () => {
    // Arrange — an empty diff too, which unheld would be retired with a comment
    // and NOOP_LABEL. A hold is a human's pause; the rescue writes nothing on it.
    strandOpenIssue([HOLD_LABEL]);
    vi.mocked(git.branchDiffIsEmpty).mockReturnValue(true);

    // Act
    collectStrandedIssues(new Set(), 1);

    // Assert
    expect(execSync).not.toHaveBeenCalled();
    expect(git.findWorktreeForBranch).not.toHaveBeenCalled();
    expect(git.markIssueNoOp).not.toHaveBeenCalled();
  });

  it('names the label once, beside the no-op marker', () => {
    // Arrange / Act / Assert — the literal the planner prompt excludes.
    expect(HOLD_LABEL).toBe('sandcastle:hold');
  });
});
