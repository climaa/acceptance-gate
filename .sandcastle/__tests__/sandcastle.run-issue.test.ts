import { agentFor } from '../sandcastle-agent-profiles.mts';
import { isDocsOnlyDiff, runBuildVerify } from '../sandcastle-build-verify.mts';
import { branchHasCommitsAhead } from '../sandcastle-git.mts';
import type { IssueRef } from '../sandcastle-issue-ref.mts';
import { runIssue } from '../sandcastle-run-issue.mts';
import { createWorktreeSandbox } from '../sandcastle-worktree-sandbox.mts';

/**
 * sandcastle-run-issue.mts runs one issue's implement → build-verify → review
 * pipeline inside a single sandbox. The sandbox, the agent factory, git and the
 * build are mocked; the pipeline's pure decisions (sandcastle-issue-pipeline.mts)
 * and formatMs stay real, so what is asserted is which agent runs, what the
 * caller gets back, when a failure propagates, and that the sandbox always closes.
 */

vi.mock('../sandcastle-worktree-sandbox.mts', () => ({
  createWorktreeSandbox: vi.fn(),
}));
vi.mock('../sandcastle-agent-profiles.mts', () => ({
  agentFor: vi.fn((role: string) => ({ agent: role })),
}));
vi.mock('../sandcastle-git.mts', () => ({
  branchHasCommitsAhead: vi.fn(() => false),
}));
vi.mock('../sandcastle-build-verify.mts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sandcastle-build-verify.mts')>()),
  isDocsOnlyDiff: vi.fn(() => false),
  runBuildVerify: vi.fn(),
}));

const ISSUE: IssueRef = {
  id: '42',
  title: 'Add the thing',
  branch: 'sandcastle/issue-42-add-the-thing',
};

type RunResult = { commits: string[] };

function fakeSandbox(...results: Array<RunResult | Error>) {
  const run = vi.fn();
  for (const result of results) {
    if (result instanceof Error) run.mockRejectedValueOnce(result);
    else run.mockResolvedValueOnce(result);
  }
  const sandbox = { run, close: vi.fn(async () => undefined) };
  vi.mocked(createWorktreeSandbox).mockResolvedValue(sandbox as never);
  return sandbox;
}

function runNames(sandbox: ReturnType<typeof fakeSandbox>): string[] {
  return sandbox.run.mock.calls.map(([options]) => options.name);
}

describe('runIssue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(branchHasCommitsAhead).mockReturnValue(false);
    vi.mocked(isDocsOnlyDiff).mockReturnValue(false);
    vi.mocked(runBuildVerify).mockResolvedValue({
      passed: true,
      stdout: 'ok',
      stats: { successful: 4, total: 4, cached: 3 },
    });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never opens a sandbox once the run is aborted', async () => {
    // Arrange
    const controller = new AbortController();
    controller.abort();

    // Act
    const run = runIssue(ISSUE, controller.signal);

    // Assert
    await expect(run).rejects.toThrow();
    expect(createWorktreeSandbox).not.toHaveBeenCalled();
  });

  it('builds then reviews when the implementer commits, returning both runs’ commits', async () => {
    // Arrange
    const sandbox = fakeSandbox(
      { commits: ['impl-1', 'impl-2'] },
      { commits: ['rev-1'] },
    );
    const signal = new AbortController().signal;

    // Act
    const result = await runIssue(ISSUE, signal);

    // Assert
    expect(createWorktreeSandbox).toHaveBeenCalledWith(ISSUE.branch);
    expect(runNames(sandbox)).toEqual(['implementer', 'reviewer']);
    expect(sandbox.run).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        signal,
        agent: { agent: 'implementer' },
        promptFile: './.sandcastle/agent-docs/implement-prompt.md',
        promptArgs: { TASK_ID: '42', ISSUE_TITLE: ISSUE.title, BRANCH: ISSUE.branch },
      }),
    );
    expect(sandbox.run).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        maxIterations: 1,
        agent: { agent: 'reviewer' },
        promptFile: './.sandcastle/agent-docs/review-prompt.md',
      }),
    );
    expect(runBuildVerify).toHaveBeenCalledWith(sandbox, '42');
    expect(result.commits).toEqual(['impl-1', 'impl-2', 'rev-1']);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\[summary\] issue #42: implement \d+s \| build \d+s \(3\/4 cached\) \| review \d+s$/,
      ),
    );
    expect(sandbox.close).toHaveBeenCalledOnce();
  });

  it('passes the issue’s per-role overrides to the agent factory', async () => {
    // Arrange
    fakeSandbox({ commits: ['impl-1'] }, { commits: [] });
    const overrides = {
      implementer: { model: 'opus' },
      reviewer: { model: 'sonnet' },
    } as unknown as IssueRef['overrides'];

    // Act
    await runIssue({ ...ISSUE, overrides }, new AbortController().signal);

    // Assert
    expect(agentFor).toHaveBeenCalledWith('implementer', overrides?.implementer);
    expect(agentFor).toHaveBeenCalledWith('reviewer', overrides?.reviewer);
  });

  it('returns the implementer’s result untouched when there is nothing to review', async () => {
    // Arrange
    const implement = { commits: [] as string[] };
    const sandbox = fakeSandbox(implement);

    // Act
    const result = await runIssue(ISSUE, new AbortController().signal);

    // Assert
    expect(result).toBe(implement);
    expect(runNames(sandbox)).toEqual(['implementer']);
    expect(runBuildVerify).not.toHaveBeenCalled();
    expect(sandbox.close).toHaveBeenCalledOnce();
  });

  it('reviews a branch already ahead of main even when the implementer commits nothing', async () => {
    // Arrange
    vi.mocked(branchHasCommitsAhead).mockReturnValue(true);
    const sandbox = fakeSandbox({ commits: [] }, { commits: ['rev-1'] });

    // Act
    const result = await runIssue(ISSUE, new AbortController().signal);

    // Assert
    expect(runNames(sandbox)).toEqual(['implementer', 'reviewer']);
    expect(result.commits).toEqual(['rev-1']);
  });

  it('salvages a failed implementer whose branch has commits ahead and reviews it', async () => {
    // Arrange
    vi.mocked(branchHasCommitsAhead).mockReturnValue(true);
    const sandbox = fakeSandbox(new Error('agent idle'), { commits: ['rev-1'] });

    // Act
    const result = await runIssue(ISSUE, new AbortController().signal);

    // Assert
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('salvaging work'));
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('agent idle'));
    expect(runNames(sandbox)).toEqual(['implementer', 'reviewer']);
    expect(result.commits).toEqual(['rev-1']);
    expect(sandbox.close).toHaveBeenCalledOnce();
  });

  it('rethrows a failed implementer with no commits ahead, still closing the sandbox', async () => {
    // Arrange
    const sandbox = fakeSandbox(new Error('agent idle'));

    // Act
    const run = runIssue(ISSUE, new AbortController().signal);

    // Assert
    await expect(run).rejects.toThrow('agent idle');
    expect(runNames(sandbox)).toEqual(['implementer']);
    expect(sandbox.close).toHaveBeenCalledOnce();
  });

  it('skips the build for a docs-only diff and says so in the summary', async () => {
    // Arrange
    vi.mocked(isDocsOnlyDiff).mockReturnValue(true);
    fakeSandbox({ commits: ['impl-1'] }, { commits: [] });

    // Act
    await runIssue(ISSUE, new AbortController().signal);

    // Assert
    expect(isDocsOnlyDiff).toHaveBeenCalledWith(ISSUE.branch);
    expect(runBuildVerify).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      '[build-verify] #42: skipped (docs-only diff)',
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('| build skipped |'),
    );
  });

  it('fails the issue on a red build with the log tail, without running the reviewer', async () => {
    // Arrange
    const stdout = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join('\n');
    vi.mocked(runBuildVerify).mockResolvedValue({ passed: false, stdout, stats: null });
    const sandbox = fakeSandbox({ commits: ['impl-1'] });

    // Act
    const run = runIssue(ISSUE, new AbortController().signal);

    // Assert
    const error = await run.catch((err: Error) => err);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(
      '[build-verify] pnpm build FAILED for #42',
    );
    expect((error as Error).message).toContain('line 60');
    expect((error as Error).message).toContain('line 11');
    expect((error as Error).message).not.toContain('line 10\n');
    expect((error as Error).message).toContain('.sandcastle/logs/build-verify-42.log');
    expect(runNames(sandbox)).toEqual(['implementer']);
    expect(sandbox.close).toHaveBeenCalledOnce();
  });

  it('fails the issue when the build itself throws, carrying its message', async () => {
    // Arrange
    vi.mocked(runBuildVerify).mockRejectedValue(new Error('container gone'));
    const sandbox = fakeSandbox({ commits: ['impl-1'] });

    // Act
    const run = runIssue(ISSUE, new AbortController().signal);

    // Assert
    await expect(run).rejects.toThrow('Build error: container gone');
    expect(runNames(sandbox)).toEqual(['implementer']);
    expect(sandbox.close).toHaveBeenCalledOnce();
  });
});
