import * as path from 'node:path';
import { read } from './helpers';
import {
  SANDCASTLE_WORKTREE_SEGMENT,
  worktreeReapBlocker,
} from '../sandcastle-worktree-safety.mts';

const PRIMARY = '/Users/dev/repo';
const OURS = path.join(PRIMARY, SANDCASTLE_WORKTREE_SEGMENT, 'issue-1234');

/**
 * These are REAL unit tests, not source-text assertions: the rules live in
 * sandcastle-worktree-safety.mts precisely so they can be imported without
 * dragging in sandcastle-config.mts's import-time side effects.
 */
describe('worktreeReapBlocker (worktree-reaper hardening)', () => {
  it('allows a clean worktree inside .sandcastle/worktrees/', () => {
    // Arrange / Act
    const blocker = worktreeReapBlocker({
      worktreePath: OURS,
      primaryPath: PRIMARY,
      dirtiness: 'clean',
    });

    // Assert
    expect(blocker).toBeNull();
  });

  it('refuses the primary checkout — a production incident', () => {
    // Arrange / Act
    const blocker = worktreeReapBlocker({
      worktreePath: PRIMARY,
      primaryPath: PRIMARY,
      dirtiness: 'clean',
    });

    // Assert
    expect(blocker).toMatch(/PRIMARY/);
  });

  it("refuses the primary checkout even when spelled with a trailing slash and '.'", () => {
    // Arrange — git and the caller may not agree on path spelling.
    const blocker = worktreeReapBlocker({
      worktreePath: `${PRIMARY}/./`,
      primaryPath: PRIMARY,
      dirtiness: 'clean',
    });

    // Assert
    expect(blocker).toMatch(/PRIMARY/);
  });

  it('refuses a worktree outside the allowlist (e.g. .claude/worktrees)', () => {
    // Arrange — a denylist of just "the primary" would let this through.
    const blocker = worktreeReapBlocker({
      worktreePath: path.join(PRIMARY, '.claude', 'worktrees', 'agent-abc'),
      primaryPath: PRIMARY,
      dirtiness: 'clean',
    });

    // Assert
    expect(blocker).toMatch(/allowlist/);
  });

  it('refuses a sibling clone that merely shares a name prefix', () => {
    // Arrange — string-prefix matching would wrongly accept this.
    const blocker = worktreeReapBlocker({
      worktreePath: '/Users/dev/repo-other/.sandcastle/worktrees/issue-1',
      primaryPath: PRIMARY,
      dirtiness: 'clean',
    });

    // Assert
    expect(blocker).toMatch(/allowlist/);
  });

  it('refuses a path escaping the allowlist via ..', () => {
    // Arrange
    const blocker = worktreeReapBlocker({
      worktreePath: path.join(
        PRIMARY,
        SANDCASTLE_WORKTREE_SEGMENT,
        '..',
        '..',
        'secrets',
      ),
      primaryPath: PRIMARY,
      dirtiness: 'clean',
    });

    // Assert
    expect(blocker).toMatch(/allowlist/);
  });

  it('refuses the worktrees container directory itself', () => {
    // Arrange — it is not a worktree, and removing it would take all of them.
    const blocker = worktreeReapBlocker({
      worktreePath: path.join(PRIMARY, SANDCASTLE_WORKTREE_SEGMENT),
      primaryPath: PRIMARY,
      dirtiness: 'clean',
    });

    // Assert
    expect(blocker).toMatch(/allowlist/);
  });

  it('refuses a dirty worktree even when it is one of ours', () => {
    // Arrange — --force would discard the uncommitted work irrecoverably.
    const blocker = worktreeReapBlocker({
      worktreePath: OURS,
      primaryPath: PRIMARY,
      dirtiness: 'dirty',
    });

    // Assert
    expect(blocker).toMatch(/uncommitted/);
  });

  it('refuses an unreadable worktree with a distinct reason from dirty', () => {
    // Arrange — a missing/broken checkout must not be reported as "uncommitted
    // changes"; the operator needs to know which situation they are in.
    const blocker = worktreeReapBlocker({
      worktreePath: OURS,
      primaryPath: PRIMARY,
      dirtiness: 'unreadable',
    });

    // Assert
    expect(blocker).toMatch(/could not be inspected/);
    expect(blocker).not.toMatch(/uncommitted/);
  });

  it('refuses when the primary worktree cannot be resolved', () => {
    // Arrange — without a primary we cannot prove the target is not it.
    const blocker = worktreeReapBlocker({
      worktreePath: OURS,
      primaryPath: null,
      dirtiness: 'clean',
    });

    // Assert
    expect(blocker).toMatch(/primary worktree could not be resolved/);
  });

  it('refuses an empty worktree path', () => {
    // Arrange / Act
    const blocker = worktreeReapBlocker({
      worktreePath: '   ',
      primaryPath: PRIMARY,
      dirtiness: 'clean',
    });

    // Assert
    expect(blocker).toMatch(/empty/);
  });
});

describe('reaper wiring (worktree-reaper hardening)', () => {
  const gitContent = read('sandcastle-git.mts');
  const strandedContent = read('sandcastle-stranded-branches.mts');
  const mergeContent = read('sandcastle-merge.mts');
  const mergePrompt = read('agent-docs/merge-prompt.md');

  it('consults the blocker before any git worktree remove', () => {
    const blockerIdx = strandedContent.indexOf('worktreeReapBlockerFor');
    const removeIdx = strandedContent.indexOf('git worktree remove');
    expect(blockerIdx).toBeGreaterThan(-1);
    expect(removeIdx).toBeGreaterThan(-1);
    expect(blockerIdx).toBeLessThan(removeIdx);
  });

  it('skips the branch delete too when the worktree is not reapable', () => {
    // A branch held by an unreapable worktree cannot be deleted anyway, and
    // trying produces the confusing double-warning from the incident.
    const blockerIdx = strandedContent.indexOf('const blocker =');
    const section = strandedContent.slice(blockerIdx, blockerIdx + 700);
    expect(section).toMatch(/continue;/);
  });

  it('resolves the primary worktree from git worktree list --porcelain', () => {
    expect(gitContent).toMatch(/primaryWorktreePath/);
    expect(gitContent).toMatch(/git worktree list --porcelain/);
  });

  it('treats an unreadable worktree as unreadable, not clean (fails closed)', () => {
    const start = gitContent.indexOf('function worktreeDirtiness');
    const fn = gitContent.slice(start, start + 500);

    // Without this, a rename leaves start at -1 and the slice silently matches
    // the wrong region instead of reporting the missing function.
    expect(start).toBeGreaterThan(-1);
    expect(fn).toMatch(/git -C .* status --porcelain/);
    // The catch arm blocks the reap — a path we cannot inspect is not "clean".
    expect(fn).toMatch(/catch\s*\{\s*return ["']unreadable["'];/);
    // git's fatal: goes nowhere, so our explanation is the only log line.
    expect(fn).toMatch(/stdio:\s*\[["']ignore["'],\s*["']pipe["'],\s*["']ignore["']\]/);
  });

  it('restores the host branch in a finally around the merger run', () => {
    expect(mergeContent).toMatch(/restoreHostBranch/);
    const finallyIdx = mergeContent.indexOf('} finally {');
    const restoreIdx = mergeContent.indexOf('restoreHostBranch(startingBranch)');
    expect(finallyIdx).toBeGreaterThan(-1);
    expect(restoreIdx).toBeGreaterThan(finallyIdx);
  });

  it('captures the starting branch before the run, not after', () => {
    const captureIdx = mergeContent.indexOf('const startingBranch');
    const runIdx = mergeContent.indexOf('await sandcastle.run');
    expect(captureIdx).toBeGreaterThan(-1);
    expect(captureIdx).toBeLessThan(runIdx);
  });

  it('tells the merge agent the checkout is a host bind-mount to hand back', () => {
    expect(mergePrompt).toMatch(/git checkout main/);
    expect(mergePrompt).toMatch(/used by worktree/);
  });
});
