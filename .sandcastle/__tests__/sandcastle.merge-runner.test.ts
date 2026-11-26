import * as sandcastle from '@ai-hero/sandcastle';
import { runMerger } from '../sandcastle-merge.mts';
import { currentBranch, restoreHostBranch, type IssueRef } from '../sandcastle-git.mts';
import { refreshQueuedPrs } from '../sandcastle-pr-queue-gh.mts';
import { headHooks } from '../sandcastle-sandbox-hooks.mts';

/**
 * runMerger is the merge phase's host side: one merger agent run, then the
 * stale-PR refresh, with the host checkout put back on its starting branch
 * whatever happens. The SDK, git and gh are the only things mocked, so what is
 * asserted is what runMerger does — the options it hands the SDK, the order of
 * its two steps, and the branch it restores — not what its source looks like.
 */

vi.mock('@ai-hero/sandcastle', () => ({
  run: vi.fn(async () => undefined),
  claudeCode: vi.fn((model: string, options?: { effort?: string }) => ({
    model,
    ...options,
  })),
}));
vi.mock('../sandcastle-git.mts', () => ({
  currentBranch: vi.fn(() => 'sandcastle/issue-1-host'),
  restoreHostBranch: vi.fn(),
}));
vi.mock('../sandcastle-pr-queue-gh.mts', () => ({
  refreshQueuedPrs: vi.fn(async () => undefined),
}));

const BRANCHES: IssueRef[] = [
  { id: '41', title: 'first fix', branch: 'sandcastle/issue-41-first-fix' },
  { id: '42', title: 'second fix', branch: 'sandcastle/issue-42-second-fix' },
];

type RunOptions = Parameters<typeof sandcastle.run>[0] & {
  promptArgs: { BRANCHES_WITH_ISSUES: string };
  hooks: unknown;
};

function runOptions(): RunOptions {
  const call = vi.mocked(sandcastle.run).mock.calls[0];
  if (!call) throw new Error('sandcastle.run was not called');
  return call[0] as RunOptions;
}

describe('runMerger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(currentBranch).mockReturnValue('sandcastle/issue-1-host');
    vi.mocked(sandcastle.run).mockResolvedValue(undefined as never);
    vi.mocked(refreshQueuedPrs).mockResolvedValue(undefined as never);
  });

  it('runs one HEAD-mode merger agent with the merge prompt and a 30-minute idle budget', async () => {
    // Arrange
    const controller = new AbortController();

    // Act
    await runMerger(BRANCHES, controller.signal);

    // Assert
    expect(sandcastle.run).toHaveBeenCalledTimes(1);
    const options = runOptions();
    expect(options).toMatchObject({
      name: 'merger',
      maxIterations: 1,
      completionSignal: '<promise>COMPLETE</promise>',
      idleTimeoutSeconds: 1800,
      promptFile: './.sandcastle/agent-docs/merge-prompt.md',
    });
    expect(options.signal).toBe(controller.signal);
    expect(options.hooks).toBe(headHooks);
    expect(options.sandbox).toBeDefined();
    expect(sandcastle.claudeCode).toHaveBeenCalledTimes(1);
  });

  it('passes one BRANCHES_WITH_ISSUES line per branch, in order', async () => {
    // Act
    await runMerger(BRANCHES, new AbortController().signal);

    // Assert
    const lines = runOptions().promptArgs.BRANCHES_WITH_ISSUES.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(
      /^- branch: sandcastle\/issue-41-first-fix, issue: 41, title: first fix, implementer: .+, reviewer: .+$/,
    );
    expect(lines[1]).toMatch(/^- branch: sandcastle\/issue-42-second-fix, issue: 42,/);
  });

  it('passes an empty BRANCHES_WITH_ISSUES and refreshes nothing when there are no branches', async () => {
    // Act
    await runMerger([], new AbortController().signal);

    // Assert
    expect(runOptions().promptArgs.BRANCHES_WITH_ISSUES).toBe('');
    expect(refreshQueuedPrs).toHaveBeenCalledWith([], expect.any(AbortSignal));
  });

  it('refreshes the queued PRs after the agent, with the branch names and the same signal', async () => {
    // Arrange
    const controller = new AbortController();
    const order: string[] = [];
    vi.mocked(sandcastle.run).mockImplementation(async () => {
      order.push('run');
      return undefined as never;
    });
    vi.mocked(refreshQueuedPrs).mockImplementation(async () => {
      order.push('refresh');
      return null;
    });

    // Act
    await runMerger(BRANCHES, controller.signal);

    // Assert
    expect(order).toEqual(['run', 'refresh']);
    expect(refreshQueuedPrs).toHaveBeenCalledWith(
      ['sandcastle/issue-41-first-fix', 'sandcastle/issue-42-second-fix'],
      controller.signal,
    );
  });

  it('restores the branch the host was on before the run', async () => {
    // Act
    await runMerger(BRANCHES, new AbortController().signal);

    // Assert
    expect(restoreHostBranch).toHaveBeenCalledTimes(1);
    expect(restoreHostBranch).toHaveBeenCalledWith('sandcastle/issue-1-host');
  });

  it('restores the base branch when the host branch cannot be read', async () => {
    // Arrange — a detached HEAD, or git failing: currentBranch returns null.
    vi.mocked(currentBranch).mockReturnValue(null);

    // Act
    await runMerger(BRANCHES, new AbortController().signal);

    // Assert
    expect(restoreHostBranch).toHaveBeenCalledWith('main');
  });

  it('restores the host branch and skips the refresh when the agent run fails', async () => {
    // Arrange
    vi.mocked(sandcastle.run).mockRejectedValue(new Error('idle timeout'));

    // Act
    const merged = runMerger(BRANCHES, new AbortController().signal);

    // Assert
    await expect(merged).rejects.toThrow('idle timeout');
    expect(refreshQueuedPrs).not.toHaveBeenCalled();
    expect(restoreHostBranch).toHaveBeenCalledWith('sandcastle/issue-1-host');
  });

  it('restores the host branch when the PR refresh fails', async () => {
    // Arrange
    vi.mocked(refreshQueuedPrs).mockRejectedValue(new Error('gh unavailable'));

    // Act
    const merged = runMerger(BRANCHES, new AbortController().signal);

    // Assert
    await expect(merged).rejects.toThrow('gh unavailable');
    expect(restoreHostBranch).toHaveBeenCalledWith('sandcastle/issue-1-host');
  });

  it('reads the starting branch before the agent runs', async () => {
    // Arrange — the agent checks out a feature branch on the bind-mounted host.
    vi.mocked(sandcastle.run).mockImplementation(async () => {
      vi.mocked(currentBranch).mockReturnValue('sandcastle/issue-41-first-fix');
      return undefined as never;
    });

    // Act
    await runMerger(BRANCHES, new AbortController().signal);

    // Assert
    expect(restoreHostBranch).toHaveBeenCalledWith('sandcastle/issue-1-host');
  });
});
