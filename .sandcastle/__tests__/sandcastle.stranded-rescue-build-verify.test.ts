import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SANDCASTLE = path.join(ROOT, '.sandcastle');

function read(file: string) {
  return fs.readFileSync(path.join(SANDCASTLE, file), 'utf8');
}

const mainContent = read('main.mts');
const buildVerifyContent = read('sandcastle-build-verify.mts');
const strandedBranchesContent = read('sandcastle-stranded-branches.mts');
const agentProfilesContent = read('sandcastle-agent-profiles.mts');
const mergeContent = read('sandcastle-merge.mts');

describe('sandcastle stranded-rescue build-verify + turbo cache (build-gate hardening)', () => {
  describe('Fix B — turbo cache permission failure inside the sandbox', () => {
    it('BUILD_VERIFY_COMMAND points turbo at a writable /tmp cache dir', () => {
      expect(buildVerifyContent).toMatch(/TURBO_CACHE_DIR=\/tmp\/turbo-cache/);
    });

    it('the writable cache dir is set on the same command that runs pnpm build', () => {
      // Prefix form: `TURBO_CACHE_DIR=/tmp/turbo-cache pnpm build`
      expect(buildVerifyContent).toMatch(
        /TURBO_CACHE_DIR=\/tmp\/turbo-cache\s+pnpm build/,
      );
    });
  });

  describe('Fix A.1 — a pipeline that failed this iteration is excluded from rescue', () => {
    it('derives the set of branches whose pipeline rejected this iteration', () => {
      // rejected settled entries map back to issues[i].branch
      expect(mainContent).toMatch(/failedBranches/);
      expect(mainContent).toMatch(/status\s*===\s*["']rejected["']/);
    });

    it('adds failed branches to the queuedBranches exclusion set', () => {
      const setIdx = mainContent.indexOf('const queuedBranches = new Set([');
      expect(setIdx).toBeGreaterThan(-1);
      const block = mainContent.slice(setIdx, setIdx + 200);
      expect(block).toMatch(/completedIssues/);
      expect(block).toMatch(/failedBranches/);
    });

    it('failedBranches is computed before queuedBranches is built', () => {
      const failedIdx = mainContent.indexOf('const failedBranches');
      const queuedIdx = mainContent.indexOf('const queuedBranches = new Set([');
      expect(failedIdx).toBeGreaterThan(-1);
      expect(queuedIdx).toBeGreaterThan(failedIdx);
    });
  });

  describe('Fix A.2 — rescued stranded branches are build-verified before merge', () => {
    it('defines a helper that build-verifies rescued branches', () => {
      expect(strandedBranchesContent).toMatch(
        /async function (buildVerifyRescuedBranch|verifyStrandedBranches)/,
      );
    });

    it('the rescue build-verify reuses runBuildVerify', () => {
      const helperIdx = strandedBranchesContent.search(
        /async function (buildVerifyRescuedBranch|verifyStrandedBranches)/,
      );
      expect(helperIdx).toBeGreaterThan(-1);
      // runBuildVerify must be referenced somewhere in the rescue helper region
      const region = strandedBranchesContent.slice(helperIdx, helperIdx + 2400);
      expect(region).toMatch(/runBuildVerify/);
    });

    it('the rescue build-verify honors the docs-only skip', () => {
      const helperIdx = strandedBranchesContent.search(
        /async function (buildVerifyRescuedBranch|verifyStrandedBranches)/,
      );
      const region = strandedBranchesContent.slice(helperIdx, helperIdx + 2400);
      expect(region).toMatch(/isDocsOnlyDiff/);
    });

    it('a failing rescued branch is logged and skipped, not merged', () => {
      const helperIdx = strandedBranchesContent.search(
        /async function (buildVerifyRescuedBranch|verifyStrandedBranches)/,
      );
      const region = strandedBranchesContent.slice(helperIdx, helperIdx + 2400);
      // skip semantics: returns false / does not include the branch
      expect(region).toMatch(/FAILED build-verify|build-verify.*skip|skip/i);
    });

    it('end-of-iteration rescue verifies stranded branches before pushing them to merge', () => {
      // collectStrandedIssues(queuedBranches) result must be verified before
      // completedIssues.push(...) feeds runMerger.
      const strandedIdx = mainContent.indexOf('collectStrandedIssues(queuedBranches)');
      expect(strandedIdx).toBeGreaterThan(-1);
      const pushIdx = mainContent.indexOf('completedIssues.push(', strandedIdx);
      expect(pushIdx).toBeGreaterThan(strandedIdx);
      const region = mainContent.slice(strandedIdx, pushIdx + 60);
      expect(region).toMatch(/buildVerifyRescuedBranch|verifyStrandedBranches/);
    });

    it('empty-plan rescue verifies stranded branches before runMerger', () => {
      const emptyPlanIdx = mainContent.indexOf('collectStrandedIssues(new Set())');
      expect(emptyPlanIdx).toBeGreaterThan(-1);
      const mergerIdx = mainContent.indexOf('runMerger(', emptyPlanIdx);
      expect(mergerIdx).toBeGreaterThan(emptyPlanIdx);
      const region = mainContent.slice(emptyPlanIdx, mergerIdx + 40);
      expect(region).toMatch(/buildVerifyRescuedBranch|verifyStrandedBranches/);
    });
  });

  describe('Acceptance — untouched surfaces', () => {
    it('per-role agent profiles are preserved for the remaining agent roles', () => {
      expect(agentProfilesContent).toMatch(/const PROFILES = \{/);
      expect(agentProfilesContent).toMatch(/planner:\s*\{\s*model:/);
      expect(agentProfilesContent).toMatch(/implementer:\s*\{\s*model:/);
      expect(agentProfilesContent).toMatch(/reviewer:\s*\{\s*model:/);
      expect(agentProfilesContent).toMatch(/merger:\s*\{\s*model:/);
    });

    it('build-verify is no longer an agent role — it runs via sandbox.exec() (0.12.0)', () => {
      expect(agentProfilesContent).not.toMatch(/buildVerify:\s*\{\s*model:/);
      expect(strandedBranchesContent + mainContent).not.toMatch(
        /agentFor\("buildVerify"\)/,
      );
    });

    it('idle timeouts are preserved (merger 1800); build-verify has its own exec timeout', () => {
      expect(mergeContent).toMatch(/idleTimeoutSeconds:\s*1800/);
      expect(buildVerifyContent).toMatch(/BUILD_VERIFY_TIMEOUT_MS\s*=\s*600_000/);
    });
  });
});
