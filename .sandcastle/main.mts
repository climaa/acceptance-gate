// Parallel Planner with Review — the composition root.
//
// The orchestrator's mechanics are split across sibling `sandcastle-*.mts`
// files by concern (config, agent profiles, git/gh queries, build-verify,
// stranded-branch rescue, the merge phase, the per-issue pipeline, and
// lifecycle/retry helpers). The preflight and the plan→execute→merge loop live
// in sandcastle-orchestrator-loop.mts, behind runOrchestrator(deps); this file
// only hands it the real implementations of every effect and starts it.
//
// Usage:
//   npx tsx .sandcastle/main.mts
// Or add to package.json:
//   "scripts": { "sandcastle": "npx tsx .sandcastle/main.mts" }

import * as sandcastle from '@ai-hero/sandcastle';
import {
  BASE_BRANCH,
  MAX_ITERATIONS,
  assertGhAvailable,
  logTurboCacheStatus,
} from './sandcastle-config.mts';
import { assertEnvOverridesValid } from './sandcastle-agent-profiles.mts';
import { refuseWithoutDocker } from './sandcastle-docker-preflight.mts';
import {
  localBranchTip,
  markIssueHeld,
  markIssueNoOp,
  probeBranchCommitsAhead,
  probeBranchDiffEmpty,
  probeIssue,
  pushBranch,
  remoteBranchTip,
} from './sandcastle-git.mts';
import { ensureImageFreshness } from './sandcastle-image-freshness.mts';
import {
  installGracefulShutdown,
  reapExitedContainers,
} from './sandcastle-lifecycle.mts';
import { hostReceiptProbe, startingMain } from './sandcastle-main-receipt.mts';
import { runMerger } from './sandcastle-merge.mts';
import { runOrchestrator } from './sandcastle-orchestrator-loop.mts';
import { runIssue } from './sandcastle-run-issue.mts';
import {
  collectStrandedIssues,
  verifyStrandedBranches,
} from './sandcastle-stranded-branches.mts';

await runOrchestrator({
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
  probeIssue,
  probeBranchCommitsAhead,
  probeBranchDiffEmpty,
  markIssueNoOp,
  markIssueHeld,
  pushBranch,
  localBranchTip,
  remoteBranchTip,
  collectStrandedIssues,
  verifyStrandedBranches,
  runMerger,
  runIssue,
});
