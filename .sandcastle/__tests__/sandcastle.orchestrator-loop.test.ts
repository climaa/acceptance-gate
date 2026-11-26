import type { Mock } from 'vitest';
import type { IssueRef } from '../sandcastle-issue-ref.mts';
import { HOLD_LABEL, NOOP_LABEL } from '../sandcastle-noop-issues.mts';
import {
  type OrchestratorDeps,
  runOrchestrator,
} from '../sandcastle-orchestrator-loop.mts';

/**
 * sandcastle-orchestrator-loop.mts is the orchestrator's run: the startup
 * preflight, then up to maxIterations rounds of plan → execute → merge. Every
 * effect arrives through OrchestratorDeps, so each one is a fake here; the pure
 * decisions the loop composes (plan parsing and screening, outcome
 * partitioning, push-or-hold, the summaries) stay real. What is asserted is what
 * the run does with their answers: what it runs, merges, holds and marks, when
 * it stops, and when it records a failed exit.
 */

vi.mock('../sandcastle-sandbox-hooks.mts', () => ({
  headSandboxOptions: vi.fn(() => ({})),
}));
vi.mock('../sandcastle-agent-profiles.mts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sandcastle-agent-profiles.mts')>()),
  agentFor: vi.fn((role: string) => ({ agent: role })),
}));

type Fakes = {
  [K in keyof OrchestratorDeps]: OrchestratorDeps[K] extends (...args: infer A) => infer R
    ? Mock<(...args: A) => R>
    : OrchestratorDeps[K];
};

const ISSUE: IssueRef = {
  id: '42',
  title: 'Add the thing',
  branch: 'sandcastle/issue-42-add-the-thing',
};
const OTHER: IssueRef = {
  id: '43',
  title: 'Add another thing',
  branch: 'sandcastle/issue-43-add-another-thing',
};

function planOf(...issues: IssueRef[]) {
  return { stdout: `<plan>${JSON.stringify({ issues })}</plan>` } as never;
}

function fakeDeps(overrides: Partial<Fakes> = {}): Fakes {
  const controller = new AbortController();
  return {
    baseBranch: 'main',
    maxIterations: 1,
    cwd: '/repo',
    assertGhAvailable: vi.fn(),
    logTurboCacheStatus: vi.fn(),
    installGracefulShutdown: vi.fn(() => controller),
    assertEnvOverridesValid: vi.fn(),
    refuseWithoutDocker: vi.fn(),
    reapExitedContainers: vi.fn(() => 0),
    ensureImageFreshness: vi.fn(),
    startingMain: vi.fn(() => 'aaaaaaa1'),
    hostReceiptProbe: vi.fn(() => ({
      fetch: () => ({ main: true, notes: true }),
      head: () => 'aaaaaaa1',
      verify: () => 'verified' as const,
    })),
    run: vi.fn(async () => planOf()),
    probeIssue: vi.fn(() => ({
      kind: 'ok' as const,
      value: { title: 'x', state: 'OPEN', labels: [] },
    })),
    probeBranchCommitsAhead: vi.fn(() => ({ kind: 'ok' as const, value: true })),
    probeBranchDiffEmpty: vi.fn(() => ({ kind: 'ok' as const, value: false })),
    markIssueNoOp: vi.fn(() => ({ commented: true, labeled: true })),
    markIssueHeld: vi.fn(() => ({ commented: true, labeled: true })),
    pushBranch: vi.fn(async () => ({ ok: true, output: '' })),
    localBranchTip: vi.fn(() => 'tip'),
    remoteBranchTip: vi.fn(() => 'tip'),
    collectStrandedIssues: vi.fn(() => []),
    verifyStrandedBranches: vi.fn(async (stranded) => [...stranded]),
    runMerger: vi.fn(async () => undefined),
    runIssue: vi.fn(async () => ({ commits: ['c1'] }) as never),
    ...overrides,
  };
}

function orchestrate(deps: Fakes) {
  return runOrchestrator(deps as unknown as OrchestratorDeps);
}

function logged(spy: Mock | ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls.map((args: unknown[]) => args.join(' ')).join('\n');
}

describe('runOrchestrator', () => {
  let log: ReturnType<typeof vi.spyOn>;
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.exitCode = undefined;
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  describe('preflight', () => {
    it('runs every startup check in order before the planner starts', async () => {
      // Arrange
      const calls: string[] = [];
      const track = (name: string) => vi.fn(() => void calls.push(name));
      const deps = fakeDeps({
        assertGhAvailable: track('gh'),
        logTurboCacheStatus: track('turbo'),
        assertEnvOverridesValid: track('env'),
        refuseWithoutDocker: track('docker'),
        reapExitedContainers: vi.fn(() => (calls.push('reap'), 0)),
        ensureImageFreshness: track('image'),
        run: vi.fn(async () => (calls.push('planner'), planOf())),
      });

      // Act
      await orchestrate(deps);

      // Assert
      expect(calls).toEqual(['gh', 'turbo', 'env', 'docker', 'reap', 'image', 'planner']);
    });

    it('starts no planner when a preflight check refuses', async () => {
      // Arrange
      const deps = fakeDeps({
        refuseWithoutDocker: vi.fn(() => {
          throw new Error('Docker is not running');
        }),
      });

      // Act
      const run = orchestrate(deps);

      // Assert
      await expect(run).rejects.toThrow('Docker is not running');
      expect(deps.run).not.toHaveBeenCalled();
    });
  });

  describe('the planned path', () => {
    it('pushes a completed branch from the host, then hands it to the merger', async () => {
      // Arrange
      const deps = fakeDeps({ run: vi.fn(async () => planOf(ISSUE)) });

      // Act
      await orchestrate(deps);

      // Assert
      expect(deps.runIssue).toHaveBeenCalledWith(
        expect.objectContaining({ id: '42' }),
        expect.any(AbortSignal),
      );
      expect(deps.pushBranch).toHaveBeenCalledWith(ISSUE.branch);
      expect(deps.runMerger).toHaveBeenCalledWith(
        [expect.objectContaining({ id: '42' })],
        expect.any(AbortSignal),
      );
      expect(process.exitCode).toBeUndefined();
    });

    it('runs planned issues one at a time, in plan order', async () => {
      // Arrange
      const started: string[] = [];
      const deps = fakeDeps({
        run: vi.fn(async () => planOf(ISSUE, OTHER)),
        runIssue: vi.fn(async (issue: IssueRef) => {
          started.push(issue.id);
          return { commits: ['c1'] } as never;
        }),
      });

      // Act
      await orchestrate(deps);

      // Assert
      expect(started).toEqual(['42', '43']);
    });

    it('refuses to run an issue whose labels gh could not read', async () => {
      // Arrange
      const deps = fakeDeps({
        run: vi.fn(async () => planOf(ISSUE)),
        probeIssue: vi.fn(() => ({ kind: 'error' as const, stderr: 'HTTP 502\n' })),
      });

      // Act
      const run = orchestrate(deps);

      // Assert
      await expect(run).rejects.toThrow(/gh issue view 42 failed.*HTTP 502/);
      expect(deps.runIssue).not.toHaveBeenCalled();
    });

    it('throws on an invalid model-override label instead of using the default', async () => {
      // Arrange
      const deps = fakeDeps({
        run: vi.fn(async () => planOf(ISSUE)),
        probeIssue: vi.fn(() => ({
          kind: 'ok' as const,
          value: { title: 'x', state: 'OPEN', labels: ['sc:implementer:gpt-9'] },
        })),
      });

      // Act
      const run = orchestrate(deps);

      // Assert
      await expect(run).rejects.toThrow(/Invalid Sandcastle model-override label/);
      expect(deps.runIssue).not.toHaveBeenCalled();
    });

    it('records a failed exit for a pipeline that threw, and never merges it', async () => {
      // Arrange
      const deps = fakeDeps({
        run: vi.fn(async () => planOf(ISSUE)),
        runIssue: vi.fn(async () => {
          throw new Error('sandbox crashed');
        }),
      });

      // Act
      await orchestrate(deps);

      // Assert
      expect(process.exitCode).toBe(1);
      expect(deps.runMerger).not.toHaveBeenCalled();
      expect(deps.collectStrandedIssues).toHaveBeenCalledWith(new Set([ISSUE.branch]), 1);
      expect(logged(warn)).toMatch(/#42.*pipeline failed/);
    });

    it('files a branch whose commits could not be counted as failed, not as a no-op', async () => {
      // Arrange
      const deps = fakeDeps({
        run: vi.fn(async () => planOf(ISSUE)),
        probeBranchCommitsAhead: vi.fn(() => ({
          kind: 'error' as const,
          stderr: 'fatal: bad object\n',
        })),
      });

      // Act
      await orchestrate(deps);

      // Assert
      expect(process.exitCode).toBe(1);
      expect(deps.markIssueNoOp).not.toHaveBeenCalled();
      expect(deps.runMerger).not.toHaveBeenCalled();
    });

    it('marks an issue that produced nothing and does not plan it again this run', async () => {
      // Arrange
      const deps = fakeDeps({
        maxIterations: 2,
        run: vi.fn(async () => planOf(ISSUE)),
        runIssue: vi.fn(async () => ({ commits: [] }) as never),
        probeBranchCommitsAhead: vi.fn(() => ({ kind: 'ok' as const, value: false })),
      });

      // Act
      await orchestrate(deps);

      // Assert
      expect(deps.markIssueNoOp).toHaveBeenCalledTimes(1);
      expect(deps.markIssueNoOp).toHaveBeenCalledWith('42', expect.any(String));
      expect(deps.runIssue).toHaveBeenCalledTimes(1);
      expect(deps.runMerger).not.toHaveBeenCalled();
      expect(logged(log)).toMatch(/#42 produced no changes/);
    });

    it('names a branch whose commits net to an empty diff as such', async () => {
      // Arrange
      const deps = fakeDeps({
        run: vi.fn(async () => planOf(ISSUE)),
        probeBranchDiffEmpty: vi.fn(() => ({ kind: 'ok' as const, value: true })),
        markIssueNoOp: vi.fn(() => ({ commented: false, labeled: false })),
      });

      // Act
      await orchestrate(deps);

      // Assert
      expect(logged(log)).toMatch(
        /#42 committed work that nets to an empty diff.*comment FAILED.*FAILED/,
      );
    });

    it('holds an issue whose host push failed instead of merging it', async () => {
      // Arrange
      const deps = fakeDeps({
        maxIterations: 2,
        run: vi.fn(async () => planOf(ISSUE)),
        pushBranch: vi.fn(async () => ({ ok: false, output: 'gate failed\n' })),
      });

      // Act
      await orchestrate(deps);

      // Assert
      expect(deps.markIssueHeld).toHaveBeenCalledWith('42', expect.any(String));
      expect(deps.runMerger).not.toHaveBeenCalled();
      expect(deps.runIssue).toHaveBeenCalledTimes(1);
      expect(logged(log)).toMatch(/push failed — held:\n {2}#42/);
    });

    it('keeps going after a merger throw, with a failed exit', async () => {
      // Arrange
      const deps = fakeDeps({
        maxIterations: 2,
        run: vi.fn(async () => planOf(ISSUE)),
        runMerger: vi.fn(async () => {
          throw new Error('gh pr create failed');
        }),
      });

      // Act
      await orchestrate(deps);

      // Assert
      expect(process.exitCode).toBe(1);
      expect(deps.run).toHaveBeenCalledTimes(2);
      expect(logged(error)).toMatch(/merge phase failed: gh pr create failed/);
    });

    it('adds verified stranded branches to the ones it merges', async () => {
      // Arrange
      const deps = fakeDeps({
        run: vi.fn(async () => planOf(ISSUE)),
        collectStrandedIssues: vi.fn(() => [OTHER]),
      });

      // Act
      await orchestrate(deps);

      // Assert
      expect(deps.verifyStrandedBranches).toHaveBeenCalledWith(
        [OTHER],
        expect.any(AbortSignal),
      );
      expect(deps.runMerger).toHaveBeenCalledWith(
        [expect.objectContaining({ id: '42' }), OTHER],
        expect.any(AbortSignal),
      );
    });

    it('still merges the planned branches when the stranded rescue throws', async () => {
      // Arrange
      const deps = fakeDeps({
        run: vi.fn(async () => planOf(ISSUE)),
        collectStrandedIssues: vi.fn(() => [OTHER]),
        verifyStrandedBranches: vi.fn(async () => {
          throw new Error('docker exec failed');
        }),
      });

      // Act
      await orchestrate(deps);

      // Assert
      expect(process.exitCode).toBe(1);
      expect(deps.runMerger).toHaveBeenCalledWith(
        [expect.objectContaining({ id: '42' })],
        expect.any(AbortSignal),
      );
    });
  });

  describe('the empty-plan path', () => {
    it('exits when nothing is planned and nothing is stranded', async () => {
      // Arrange
      const deps = fakeDeps({ maxIterations: 3 });

      // Act
      await orchestrate(deps);

      // Assert
      expect(deps.run).toHaveBeenCalledTimes(1);
      expect(logged(log)).toMatch(/No unblocked issues to work on\. Exiting\./);
    });

    it('exits when every planned issue is already marked', async () => {
      // Arrange
      const deps = fakeDeps({
        maxIterations: 3,
        run: vi.fn(async () => planOf(ISSUE, OTHER)),
        probeIssue: vi.fn((id: string) => ({
          kind: 'ok' as const,
          value: {
            title: 'x',
            state: 'OPEN',
            labels: [id === '42' ? NOOP_LABEL : HOLD_LABEL],
          },
        })),
      });

      // Act
      await orchestrate(deps);

      // Assert
      expect(deps.runIssue).not.toHaveBeenCalled();
      expect(logged(log)).toMatch(
        /Every planned issue is already marked no-op or on hold/,
      );
    });

    it('verifies, pushes and merges stranded branches, once per run', async () => {
      // Arrange
      const deps = fakeDeps({
        maxIterations: 2,
        collectStrandedIssues: vi
          .fn()
          .mockReturnValueOnce([ISSUE])
          .mockReturnValue([]) as Fakes['collectStrandedIssues'],
      });

      // Act
      await orchestrate(deps);

      // Assert
      expect(deps.pushBranch).toHaveBeenCalledWith(ISSUE.branch);
      expect(deps.runMerger).toHaveBeenCalledWith([ISSUE], expect.any(AbortSignal));
      expect(deps.collectStrandedIssues).toHaveBeenLastCalledWith(
        new Set([ISSUE.branch]),
        2,
      );
    });

    it('exits when no stranded branch passes build-verify', async () => {
      // Arrange
      const deps = fakeDeps({
        maxIterations: 3,
        collectStrandedIssues: vi.fn(() => [ISSUE]),
        verifyStrandedBranches: vi.fn(async () => []),
      });

      // Act
      await orchestrate(deps);

      // Assert
      expect(deps.run).toHaveBeenCalledTimes(1);
      expect(deps.runMerger).not.toHaveBeenCalled();
    });

    it('records a failed exit and tries again next iteration when the rescue throws', async () => {
      // Arrange
      const deps = fakeDeps({
        maxIterations: 2,
        collectStrandedIssues: vi.fn(() => [ISSUE]),
        verifyStrandedBranches: vi.fn(async () => {
          throw new Error('docker exec failed');
        }),
      });

      // Act
      await orchestrate(deps);

      // Assert
      expect(process.exitCode).toBe(1);
      expect(deps.run).toHaveBeenCalledTimes(2);
    });

    it('merges nothing when every stranded branch fails its host push', async () => {
      // Arrange
      const deps = fakeDeps({
        collectStrandedIssues: vi.fn(() => [ISSUE]),
        pushBranch: vi.fn(async () => ({ ok: false, output: '' })),
      });

      // Act
      await orchestrate(deps);

      // Assert
      expect(deps.markIssueHeld).toHaveBeenCalledWith('42', expect.any(String));
      expect(deps.runMerger).not.toHaveBeenCalled();
    });

    it('records a failed exit when merging stranded branches throws', async () => {
      // Arrange
      const deps = fakeDeps({
        collectStrandedIssues: vi.fn(() => [ISSUE]),
        runMerger: vi.fn(async () => {
          throw new Error('gh pr create failed');
        }),
      });

      // Act
      await orchestrate(deps);

      // Assert
      expect(process.exitCode).toBe(1);
    });
  });

  describe('failures and shutdown', () => {
    it('records a failed exit and plans again when the planner throws', async () => {
      // Arrange
      const deps = fakeDeps({
        maxIterations: 2,
        run: vi
          .fn()
          .mockRejectedValueOnce(new Error('no <plan> tag'))
          .mockResolvedValue(planOf()),
      });

      // Act
      await orchestrate(deps);

      // Assert
      expect(process.exitCode).toBe(1);
      expect(deps.run).toHaveBeenCalledTimes(2);
    });

    it('stops cleanly when a shutdown interrupts the planner', async () => {
      // Arrange
      const controller = new AbortController();
      const deps = fakeDeps({
        maxIterations: 3,
        installGracefulShutdown: vi.fn(() => controller),
        run: vi.fn(async () => {
          controller.abort();
          throw new Error('aborted');
        }),
      });

      // Act
      await orchestrate(deps);

      // Assert
      expect(process.exitCode).toBeUndefined();
      expect(deps.run).toHaveBeenCalledTimes(1);
      expect(logged(log)).toMatch(/Shutdown requested during planning/);
    });

    it('starts no iteration once a shutdown was requested', async () => {
      // Arrange
      const controller = new AbortController();
      controller.abort();
      const deps = fakeDeps({ installGracefulShutdown: vi.fn(() => controller) });

      // Act
      await orchestrate(deps);

      // Assert
      expect(deps.run).not.toHaveBeenCalled();
      expect(logged(log)).toMatch(/All done\./);
    });

    it('names the issues a shutdown left unattempted', async () => {
      // Arrange
      const controller = new AbortController();
      const deps = fakeDeps({
        installGracefulShutdown: vi.fn(() => controller),
        run: vi.fn(async () => planOf(ISSUE, OTHER)),
        runIssue: vi.fn(async () => {
          controller.abort();
          return { commits: ['c1'] } as never;
        }),
      });

      // Act
      await orchestrate(deps);

      // Assert
      expect(deps.runIssue).toHaveBeenCalledTimes(1);
      expect(logged(warn)).toMatch(/#43.*not attempted \(shutdown requested\)/);
    });

    it('stops without merging when a shutdown interrupts the merger', async () => {
      // Arrange
      const controller = new AbortController();
      const deps = fakeDeps({
        maxIterations: 2,
        installGracefulShutdown: vi.fn(() => controller),
        run: vi.fn(async () => planOf(ISSUE)),
        runMerger: vi.fn(async () => {
          controller.abort();
          throw new Error('aborted');
        }),
      });

      // Act
      await orchestrate(deps);

      // Assert
      expect(process.exitCode).toBeUndefined();
      expect(deps.run).toHaveBeenCalledTimes(1);
    });
  });

  describe('the end of the run', () => {
    it('reports whether main has a receipt when the run moved it', async () => {
      // Arrange
      const deps = fakeDeps({
        hostReceiptProbe: vi.fn(() => ({
          fetch: () => ({ main: true, notes: true }),
          head: () => 'bbbbbbb2',
          verify: () => 'verified' as const,
        })),
      });

      // Act
      await orchestrate(deps);

      // Assert
      expect(deps.startingMain).toHaveBeenCalledWith('/repo');
      expect(deps.hostReceiptProbe).toHaveBeenCalledWith('/repo');
      expect(logged(log)).toMatch(/main verified bbbbbbb/);
    });

    it('says nothing about main when the run did not move it', async () => {
      // Arrange
      const deps = fakeDeps();

      // Act
      await orchestrate(deps);

      // Assert
      expect(logged(log)).not.toMatch(/receipt|verified/);
    });
  });
});
