import * as sandcastle from '@ai-hero/sandcastle';
import { assertEnvOverridesValid } from '../sandcastle-agent-profiles.mts';
import {
  BASE_BRANCH,
  MAX_ITERATIONS,
  assertGhAvailable,
  logTurboCacheStatus,
} from '../sandcastle-config.mts';
import { refuseWithoutDocker } from '../sandcastle-docker-preflight.mts';
import * as git from '../sandcastle-git.mts';
import { ensureImageFreshness } from '../sandcastle-image-freshness.mts';
import {
  installGracefulShutdown,
  reapExitedContainers,
} from '../sandcastle-lifecycle.mts';
import { hostReceiptProbe, startingMain } from '../sandcastle-main-receipt.mts';
import { runMerger } from '../sandcastle-merge.mts';
import { runOrchestrator } from '../sandcastle-orchestrator-loop.mts';
import { runIssue } from '../sandcastle-run-issue.mts';
import {
  collectStrandedIssues,
  verifyStrandedBranches,
} from '../sandcastle-stranded-branches.mts';

/**
 * main.mts is the composition root: importing it starts the run. The run itself
 * is stubbed, so importing it here only shows what main.mts hands over — each
 * dependency must be the real implementation, never a stand-in, or the
 * orchestrator would run against something other than gh, git and Docker.
 */

vi.mock('../sandcastle-orchestrator-loop.mts', () => ({
  runOrchestrator: vi.fn(async () => undefined),
}));

describe('main.mts', () => {
  it('starts the orchestrator once, wired to the real implementations', async () => {
    // Arrange
    const expected = {
      baseBranch: BASE_BRANCH,
      maxIterations: MAX_ITERATIONS,
      cwd: process.cwd(),
      assertGhAvailable,
      logTurboCacheStatus,
      installGracefulShutdown,
      assertEnvOverridesValid,
      refuseWithoutDocker,
      reapExitedContainers,
      ensureImageFreshness,
      startingMain,
      hostReceiptProbe,
      run: sandcastle.run,
      probeIssue: git.probeIssue,
      probeBranchCommitsAhead: git.probeBranchCommitsAhead,
      probeBranchDiffEmpty: git.probeBranchDiffEmpty,
      markIssueNoOp: git.markIssueNoOp,
      markIssueHeld: git.markIssueHeld,
      pushBranch: git.pushBranch,
      localBranchTip: git.localBranchTip,
      remoteBranchTip: git.remoteBranchTip,
      collectStrandedIssues,
      verifyStrandedBranches,
      runMerger,
      runIssue,
    };

    // Act
    await import('../main.mts');

    // Assert
    expect(runOrchestrator).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runOrchestrator).mock.calls[0]![0]).toStrictEqual(expected);
  });
});
