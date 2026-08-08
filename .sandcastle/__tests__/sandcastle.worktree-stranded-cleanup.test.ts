import { read } from './helpers';

describe('sandcastle stranded-cleanup worktree-aware ', () => {
  // "git worktree list --porcelain" lives only in findWorktreeForBranch()
  // (sandcastle-git.mts); the closed-issue cleanup block lives in
  // collectStrandedIssues() (sandcastle-stranded-branches.mts) — two
  // different files now, so this needs two reads instead of one.
  const gitContent = read('sandcastle-git.mts');
  const strandedBranchesContent = read('sandcastle-stranded-branches.mts');

  // The closed-issue cleanup now lives in reapClosedIssueBranch(); the
  // issue.state guard that routes to it stays in collectStrandedIssues().
  const reapStart = strandedBranchesContent.indexOf('function reapClosedIssueBranch');
  const reapBody = strandedBranchesContent.slice(reapStart, reapStart + 1500);

  it('queries git worktree list --porcelain to find registered worktrees', () => {
    expect(gitContent).toMatch(/git worktree list --porcelain/);
  });

  it('removes the worktree with git worktree remove --force in closed-issue cleanup', () => {
    expect(reapBody).toMatch(/git worktree remove --force/);
  });

  it('git worktree remove appears before git branch -D in the reap helper', () => {
    const worktreeRemoveIdx = reapBody.indexOf('git worktree remove');
    const branchDeleteIdx = reapBody.indexOf('git branch -D');
    expect(worktreeRemoveIdx).toBeGreaterThan(-1);
    expect(branchDeleteIdx).toBeGreaterThan(-1);
    expect(worktreeRemoveIdx).toBeLessThan(branchDeleteIdx);
  });

  it('cleanup runs only for a closed issue (open-issue branches untouched)', () => {
    // The reap is reached solely via the issue.state guard in the caller.
    expect(strandedBranchesContent).toMatch(/issue\.state\s*!==\s*["']OPEN["']/);
    expect(strandedBranchesContent).toMatch(/reapClosedIssueBranch\(/);
  });
});
