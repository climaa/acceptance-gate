import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SANDCASTLE = path.join(ROOT, '.sandcastle');

function read(file: string) {
  return fs.readFileSync(path.join(SANDCASTLE, file), 'utf8');
}

describe('sandcastle stranded-cleanup worktree-aware ', () => {
  // "git worktree list --porcelain" lives only in findWorktreeForBranch()
  // (sandcastle-git.mts); the closed-issue cleanup block lives in
  // collectStrandedIssues() (sandcastle-stranded-branches.mts) — two
  // different files now, so this needs two reads instead of one.
  const gitContent = read('sandcastle-git.mts');
  const strandedBranchesContent = read('sandcastle-stranded-branches.mts');

  // The CLOSED-issue cleanup block starts at `if (issue.state !== "OPEN")`
  const closedBlockStart = strandedBranchesContent.indexOf('if (issue.state !== "OPEN")');
  // Slice enough to cover the full cleanup block (~1500 chars)
  const cleanupSection = strandedBranchesContent.slice(
    closedBlockStart,
    closedBlockStart + 1500,
  );

  it('queries git worktree list --porcelain to find registered worktrees', () => {
    expect(gitContent).toMatch(/git worktree list --porcelain/);
  });

  it('removes the worktree with git worktree remove --force in closed-issue cleanup', () => {
    expect(cleanupSection).toMatch(/git worktree remove --force/);
  });

  it('git worktree remove appears before git branch -D in closed-issue block', () => {
    const worktreeRemoveIdx = cleanupSection.indexOf('git worktree remove');
    const branchDeleteIdx = cleanupSection.indexOf('git branch -D');
    expect(worktreeRemoveIdx).toBeGreaterThan(-1);
    expect(branchDeleteIdx).toBeGreaterThan(-1);
    expect(worktreeRemoveIdx).toBeLessThan(branchDeleteIdx);
  });

  it('closed-issue block is guarded by issue.state check (open-issue branches untouched)', () => {
    expect(cleanupSection).toMatch(/issue\.state\s*!==\s*["']OPEN["']/);
  });
});
