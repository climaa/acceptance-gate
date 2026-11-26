import { execFileSync, execSync } from 'node:child_process';
import { hostMergeIO, resolveDirtyBranch } from '../sandcastle-additive-merge.mts';
import {
  QUEUE_PASS_INTERVAL_MS,
  ghQueueGateway,
  refreshQueuedPrs,
} from '../sandcastle-pr-queue-gh.mts';
import {
  type QueueAction,
  type QueueOutcome,
  reconcilePrQueue,
} from '../sandcastle-pr-queue.mts';

/**
 * sandcastle-pr-queue-gh.mts is the `gh` half of the PR-queue reconciler. The
 * shell, the additive-merge resolver and the reconcile loop are mocked; the
 * JSON parsers stay real, so what is asserted is the command each gateway
 * method runs, how a gh failure degrades, which PRs the run may see, and that
 * refreshQueuedPrs never throws.
 */

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}));
vi.mock('../sandcastle-additive-merge.mts', () => ({
  hostMergeIO: vi.fn(() => ({ io: 'host' })),
  resolveDirtyBranch: vi.fn(() => ({ ok: true, sha: 'abc123' })),
}));
vi.mock('../sandcastle-pr-queue.mts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sandcastle-pr-queue.mts')>()),
  reconcilePrQueue: vi.fn(),
}));

const FIRST = 'sandcastle/issue-41-first';
const SECOND = 'sandcastle/issue-42-second';
const OWNED = [FIRST, SECOND];

function action(pr: number, branch: string): QueueAction {
  return { pr, branch, kind: 'update-branch' } as QueueAction;
}

function ghPrListJson(
  ...entries: Array<{ number: number; headRefName: string }>
): string {
  return JSON.stringify(
    entries.map((entry) => ({
      ...entry,
      state: 'OPEN',
      mergeStateStatus: 'BEHIND',
      autoMergeRequest: null,
      changedFiles: 3,
    })),
  );
}

const OUTCOME: QueueOutcome = {
  passes: 2,
  updated: [41],
  armed: [],
  resolved: [],
  failed: [],
  conflicted: [],
  stillOpen: [],
  cappedOut: false,
};

const fail = (): never => {
  throw new Error('gh: exit 1');
};

describe('ghQueueGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(execSync).mockReturnValue('' as never);
    vi.mocked(execFileSync).mockReturnValue('' as never);
  });

  describe('listOwnedPrs', () => {
    it('lists open PRs on main with the fields the planner reads, keeping only owned branches', () => {
      // Arrange
      vi.mocked(execSync).mockReturnValue(
        ghPrListJson(
          { number: 41, headRefName: FIRST },
          { number: 7, headRefName: 'someone/human-branch' },
          { number: 42, headRefName: SECOND },
        ) as never,
      );
      const gateway = ghQueueGateway(OWNED, new AbortController().signal);

      // Act
      const prs = gateway.listOwnedPrs();

      // Assert
      expect(execSync).toHaveBeenCalledWith(
        'gh pr list --state open --base main --limit 100 ' +
          '--json number,headRefName,state,mergeStateStatus,autoMergeRequest,changedFiles',
        expect.objectContaining({ encoding: 'utf8' }),
      );
      expect(prs).toEqual([
        {
          number: 41,
          branch: FIRST,
          state: 'OPEN',
          mergeStateStatus: 'BEHIND',
          autoMergeEnabled: false,
          changedFiles: 3,
        },
        expect.objectContaining({ number: 42, branch: SECOND }),
      ]);
    });

    it('reports an empty queue when gh fails', () => {
      // Arrange
      vi.mocked(execSync).mockImplementation(fail);
      const gateway = ghQueueGateway(OWNED, new AbortController().signal);

      // Act
      const prs = gateway.listOwnedPrs();

      // Assert
      expect(prs).toEqual([]);
    });

    it('reports an empty queue without calling gh once the run is aborted', () => {
      // Arrange
      const controller = new AbortController();
      const gateway = ghQueueGateway(OWNED, controller.signal);
      controller.abort();

      // Act
      const prs = gateway.listOwnedPrs();

      // Assert
      expect(prs).toEqual([]);
      expect(execSync).not.toHaveBeenCalled();
    });
  });

  describe('gh writes', () => {
    it('updates a PR branch with gh pr update-branch and reports success', () => {
      // Arrange
      const gateway = ghQueueGateway(OWNED, new AbortController().signal);

      // Act
      const ok = gateway.updateBranch(action(41, FIRST));

      // Assert
      expect(ok).toBe(true);
      expect(execSync).toHaveBeenCalledWith('gh pr update-branch 41', { stdio: 'pipe' });
    });

    it('arms squash auto-merge with gh pr merge --squash --auto', () => {
      // Arrange
      const gateway = ghQueueGateway(OWNED, new AbortController().signal);

      // Act
      const ok = gateway.armAutoMerge(action(42, SECOND));

      // Assert
      expect(ok).toBe(true);
      expect(execSync).toHaveBeenCalledWith('gh pr merge 42 --squash --auto', {
        stdio: 'pipe',
      });
    });

    it('reports false, without throwing, when gh refuses a write', () => {
      // Arrange
      vi.mocked(execSync).mockImplementation(fail);
      const gateway = ghQueueGateway(OWNED, new AbortController().signal);

      // Act
      const updated = gateway.updateBranch(action(41, FIRST));
      const armed = gateway.armAutoMerge(action(41, FIRST));

      // Assert
      expect(updated).toBe(false);
      expect(armed).toBe(false);
    });
  });

  describe('commentOnIssue', () => {
    it('passes the body as an argument, never through a shell', () => {
      // Arrange
      const gateway = ghQueueGateway(OWNED, new AbortController().signal);
      const body = 'resolved; `rm -rf /` "$(whoami)"';

      // Act
      const ok = gateway.commentOnIssue(41, body);

      // Assert
      expect(ok).toBe(true);
      expect(execFileSync).toHaveBeenCalledWith(
        'gh',
        ['issue', 'comment', '41', '--body', body],
        { stdio: 'pipe' },
      );
      expect(execSync).not.toHaveBeenCalled();
    });

    it('reports false when gh cannot comment', () => {
      // Arrange
      vi.mocked(execFileSync).mockImplementation(fail);
      const gateway = ghQueueGateway(OWNED, new AbortController().signal);

      // Act
      const ok = gateway.commentOnIssue(41, 'body');

      // Assert
      expect(ok).toBe(false);
    });
  });

  describe('closingIssues', () => {
    it('reads closingIssuesReferences for the PR and returns the issue numbers', () => {
      // Arrange
      vi.mocked(execSync).mockReturnValue(
        JSON.stringify({
          closingIssuesReferences: [{ number: 41 }, { number: 43 }],
        }) as never,
      );
      const gateway = ghQueueGateway(OWNED, new AbortController().signal);

      // Act
      const issues = gateway.closingIssues(41);

      // Assert
      expect(execSync).toHaveBeenCalledWith(
        'gh pr view 41 --json closingIssuesReferences',
        expect.objectContaining({ encoding: 'utf8' }),
      );
      expect(issues).toEqual([41, 43]);
    });

    it('returns null, not an empty list, when gh fails', () => {
      // Arrange
      vi.mocked(execSync).mockImplementation(fail);
      const gateway = ghQueueGateway(OWNED, new AbortController().signal);

      // Act
      const issues = gateway.closingIssues(41);

      // Assert
      expect(issues).toBeNull();
    });
  });

  describe('resolveConflict', () => {
    it('resolves the branch on the host from the current directory and drops the sha', () => {
      // Arrange
      const gateway = ghQueueGateway(OWNED, new AbortController().signal);

      // Act
      const result = gateway.resolveConflict(action(41, FIRST));

      // Assert
      expect(result).toEqual({ ok: true });
      expect(hostMergeIO).toHaveBeenCalledWith(process.cwd());
      expect(resolveDirtyBranch).toHaveBeenCalledWith(FIRST, process.cwd(), {
        io: 'host',
      });
    });

    it("passes the resolver's refusal through unchanged", () => {
      // Arrange
      const refusal = {
        ok: false as const,
        reason: 'non-additive conflict',
        retry: false,
      };
      vi.mocked(resolveDirtyBranch).mockReturnValue(refusal);
      const gateway = ghQueueGateway(OWNED, new AbortController().signal);

      // Act
      const result = gateway.resolveConflict(action(41, FIRST));

      // Assert
      expect(result).toBe(refusal);
    });

    it('refuses with a retryable reason and starts no resolution once the run is aborted', () => {
      // Arrange
      const controller = new AbortController();
      const gateway = ghQueueGateway(OWNED, controller.signal);
      controller.abort();

      // Act
      const result = gateway.resolveConflict(action(41, FIRST));

      // Assert
      expect(result).toEqual({ ok: false, reason: 'run aborted', retry: true });
      expect(resolveDirtyBranch).not.toHaveBeenCalled();
    });
  });

  describe('waitBeforeNextPass', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('waits the pass interval before resolving', async () => {
      // Arrange
      vi.useFakeTimers();
      const gateway = ghQueueGateway(OWNED, new AbortController().signal);
      let settled = false;

      // Act
      const wait = gateway.waitBeforeNextPass(1).then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(QUEUE_PASS_INTERVAL_MS - 1);
      const settledEarly = settled;
      await vi.advanceTimersByTimeAsync(1);
      await wait;

      // Assert
      expect(QUEUE_PASS_INTERVAL_MS).toBe(60_000);
      expect(settledEarly).toBe(false);
      expect(settled).toBe(true);
    });

    it('resolves as soon as the run is aborted, without waiting out the timer', async () => {
      // Arrange
      vi.useFakeTimers();
      const controller = new AbortController();
      const gateway = ghQueueGateway(OWNED, controller.signal);
      let settled = false;

      // Act
      const wait = gateway.waitBeforeNextPass(1).then(() => {
        settled = true;
      });
      controller.abort();
      await vi.advanceTimersByTimeAsync(0);
      await wait;

      // Assert
      expect(settled).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('resolves immediately when the run was already aborted', async () => {
      // Arrange
      vi.useFakeTimers();
      const controller = new AbortController();
      controller.abort();
      const gateway = ghQueueGateway(OWNED, controller.signal);

      // Act
      await gateway.waitBeforeNextPass(1);

      // Assert
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  it('logs each line to the console', () => {
    // Arrange
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const gateway = ghQueueGateway(OWNED, new AbortController().signal);

    // Act
    gateway.log('[pr-queue] pass 1');

    // Assert
    expect(log).toHaveBeenCalledWith('[pr-queue] pass 1');
    log.mockRestore();
  });
});

describe('refreshQueuedPrs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing when the run owns no branches', async () => {
    // Act
    const outcome = await refreshQueuedPrs([], new AbortController().signal);

    // Assert
    expect(outcome).toBeNull();
    expect(reconcilePrQueue).not.toHaveBeenCalled();
  });

  it('does nothing when the run is already aborted', async () => {
    // Arrange
    const controller = new AbortController();
    controller.abort();

    // Act
    const outcome = await refreshQueuedPrs(OWNED, controller.signal);

    // Assert
    expect(outcome).toBeNull();
    expect(reconcilePrQueue).not.toHaveBeenCalled();
  });

  it('reconciles through the gh gateway, logs the summary and returns the outcome', async () => {
    // Arrange
    vi.mocked(reconcilePrQueue).mockResolvedValue(OUTCOME);

    // Act
    const outcome = await refreshQueuedPrs(OWNED, new AbortController().signal);

    // Assert
    expect(outcome).toBe(OUTCOME);
    expect(reconcilePrQueue).toHaveBeenCalledTimes(1);
    const gateway = vi.mocked(reconcilePrQueue).mock.calls[0]?.[0];
    expect(gateway).toEqual(
      expect.objectContaining({
        listOwnedPrs: expect.any(Function),
        updateBranch: expect.any(Function),
        armAutoMerge: expect.any(Function),
      }),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(
        'reconciling 2 branch(es) against strict branch protection on main',
      ),
    );
    expect(console.log).toHaveBeenCalledWith(
      '[pr-queue] 2 pass(es); updated #41; all owned PRs merged or closed',
    );
  });

  it('warns and returns null instead of throwing when reconciliation fails', async () => {
    // Arrange
    vi.mocked(reconcilePrQueue).mockRejectedValue(new Error('gh rate limited'));

    // Act
    const outcome = await refreshQueuedPrs(OWNED, new AbortController().signal);

    // Assert
    expect(outcome).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('pr-queue reconciliation failed: gh rate limited'),
    );
  });
});
