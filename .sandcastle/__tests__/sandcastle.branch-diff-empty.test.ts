import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { branchDiffIsEmpty, probeBranchDiffEmpty } from '../sandcastle-git.mts';

/**
 * REAL behavioural tests against a scratch git repo — no mocks.
 *
 * What is being protected: "the branch has commits ahead of base" and "the
 * branch has content to land" are different questions, and every caller used to
 * ask only the first. A branch that adds a file and then reverts it in the next
 * commit answers yes to `git rev-list --count`, so it was rescued, verified,
 * handed to a merger with nothing to merge, and found again the next iteration
 * — for as many iterations as the run had.
 *
 * The probe reads `origin/main`, so the fixture pushes to a real bare remote
 * rather than faking the ref: an `origin/…` that only exists as a local branch
 * would not exercise the same revision lookup.
 */

function git(dir: string, args: string[]): void {
  execFileSync('git', ['-C', dir, ...args], { stdio: 'pipe' });
}

function commitFile(dir: string, file: string, contents: string, message: string): void {
  fs.writeFileSync(path.join(dir, file), contents);
  git(dir, ['add', file]);
  git(dir, ['commit', '-q', '-m', message]);
}

/** A repo on `main`, with `origin/main` published to a bare remote beside it. */
function scratchRepo(): { dir: string; remote: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandcastle-diff-'));
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'sandcastle-remote-'));
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote], { stdio: 'pipe' });
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Sandcastle Test']);
  commitFile(dir, 'README.md', '# scratch\n', 'init');
  git(dir, ['remote', 'add', 'origin', remote]);
  git(dir, ['push', '-q', 'origin', 'main']);
  return { dir, remote };
}

describe('probeBranchDiffEmpty', () => {
  let dir: string;
  let remote: string;

  beforeEach(() => {
    ({ dir, remote } = scratchRepo());
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(remote, { recursive: true, force: true });
  });

  it('reports an add-then-revert pair as empty even though commits exist', () => {
    // Arrange — the shape that stranded a branch forever: two real commits, no
    // net content.
    git(dir, ['checkout', '-q', '-b', 'sandcastle/issue-1-workflow']);
    commitFile(dir, 'drift.yml', 'on: push\n', 'add workflow');
    git(dir, ['rm', '-q', 'drift.yml']);
    git(dir, ['commit', '-q', '-m', 'revert workflow']);

    // Act
    const probe = probeBranchDiffEmpty('sandcastle/issue-1-workflow', dir);

    // Assert
    expect(probe).toEqual({ kind: 'ok', value: true });
  });

  it('reports a branch that changed a file as non-empty', () => {
    // Arrange
    git(dir, ['checkout', '-q', '-b', 'sandcastle/issue-2-real']);
    commitFile(dir, 'feature.ts', 'export const x = 1;\n', 'add feature');

    // Act
    const probe = probeBranchDiffEmpty('sandcastle/issue-2-real', dir);

    // Assert
    expect(probe).toEqual({ kind: 'ok', value: false });
  });

  it('reads content restored to its original bytes as empty', () => {
    // Arrange — an edit and its exact undo, rather than an add and a delete.
    git(dir, ['checkout', '-q', '-b', 'sandcastle/issue-3-undo']);
    commitFile(dir, 'README.md', '# edited\n', 'edit readme');
    commitFile(dir, 'README.md', '# scratch\n', 'undo edit');

    // Act & Assert
    expect(probeBranchDiffEmpty('sandcastle/issue-3-undo', dir)).toEqual({
      kind: 'ok',
      value: true,
    });
  });

  it('ignores commits that landed on the base branch after the fork', () => {
    // Arrange — three-dot semantics: base moving ahead is not the branch
    // reverting its own work, and must not read as "this branch is empty".
    git(dir, ['checkout', '-q', '-b', 'sandcastle/issue-4-fork']);
    commitFile(dir, 'feature.ts', 'export const x = 1;\n', 'add feature');
    git(dir, ['checkout', '-q', 'main']);
    commitFile(dir, 'other.ts', 'export const y = 2;\n', 'unrelated base work');
    git(dir, ['push', '-q', 'origin', 'main']);
    git(dir, ['fetch', '-q', 'origin']);

    // Act & Assert
    expect(probeBranchDiffEmpty('sandcastle/issue-4-fork', dir)).toEqual({
      kind: 'ok',
      value: false,
    });
  });

  it('reports a branch that does not exist as absent, not as empty', () => {
    // Arrange & Act
    const probe = probeBranchDiffEmpty('sandcastle/issue-99-missing', dir);

    // Assert — "absent" must not collapse into "empty", or a first run would
    // mark an issue whose branch was never created.
    expect(probe.kind).toBe('absent');
  });

  it('reports a failure outside a git repository as an error', () => {
    // Arrange
    const notRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'sandcastle-nogit-'));

    // Act & Assert
    try {
      expect(probeBranchDiffEmpty('sandcastle/issue-1-x', notRepo).kind).toBe('error');
    } finally {
      fs.rmSync(notRepo, { recursive: true, force: true });
    }
  });
});

describe('branchDiffIsEmpty', () => {
  let dir: string;
  let remote: string;

  beforeEach(() => {
    ({ dir, remote } = scratchRepo());
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(remote, { recursive: true, force: true });
  });

  it('is true for an add-then-revert branch', () => {
    // Arrange
    git(dir, ['checkout', '-q', '-b', 'sandcastle/issue-5-noop']);
    commitFile(dir, 'x.txt', 'x\n', 'add x');
    git(dir, ['rm', '-q', 'x.txt']);
    git(dir, ['commit', '-q', '-m', 'remove x']);

    // Act & Assert
    expect(branchDiffIsEmpty('sandcastle/issue-5-noop', dir)).toBe(true);
  });

  it('is false when the diff cannot be read at all', () => {
    // Arrange — an unreadable diff is not evidence of an empty one. The
    // boolean collapses absent and error to false so a transient git failure
    // can never durably retire an issue.
    const notRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'sandcastle-nogit-'));

    // Act & Assert
    try {
      expect(branchDiffIsEmpty('sandcastle/issue-5-noop', notRepo)).toBe(false);
    } finally {
      fs.rmSync(notRepo, { recursive: true, force: true });
    }
  });

  it('is false for a missing branch', () => {
    // Arrange & Act & Assert
    expect(branchDiffIsEmpty('sandcastle/issue-99-missing', dir)).toBe(false);
  });
});
