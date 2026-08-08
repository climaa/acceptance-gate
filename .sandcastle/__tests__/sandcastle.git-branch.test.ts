import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { currentBranch, restoreHostBranch } from '../sandcastle-git.mts';

/**
 * REAL behavioural tests against a scratch git repo — no mocks. currentBranch
 * and restoreHostBranch guard the host-checkout-restore safety path (the merger
 * bind-mounts the developer's checkout and can leave it on a feature branch),
 * so they are exercised against actual `git`, driven by the `cwd` seam so the
 * test never chdir's the process.
 */

function git(dir: string, args: string[]): void {
  execFileSync('git', ['-C', dir, ...args], { stdio: 'pipe' });
}

function scratchRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandcastle-git-'));
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Sandcastle Test']);
  git(dir, ['commit', '-q', '--allow-empty', '-m', 'init']);
  return dir;
}

describe('currentBranch', () => {
  let dir: string;
  beforeEach(() => {
    dir = scratchRepo();
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns the checked-out branch name', () => {
    // Arrange & Act & Assert
    expect(currentBranch(dir)).toBe('main');
    git(dir, ['checkout', '-q', '-b', 'sandcastle/issue-1-feature']);
    expect(currentBranch(dir)).toBe('sandcastle/issue-1-feature');
  });

  it('returns null outside a git repository', () => {
    // Arrange
    const notRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'sandcastle-nogit-'));

    // Act & Assert
    try {
      expect(currentBranch(notRepo)).toBeNull();
    } finally {
      fs.rmSync(notRepo, { recursive: true, force: true });
    }
  });
});

describe('restoreHostBranch', () => {
  let dir: string;
  beforeEach(() => {
    dir = scratchRepo();
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('switches the checkout back to the starting branch', () => {
    // Arrange — the "merger left it on a feature branch" situation.
    git(dir, ['checkout', '-q', '-b', 'sandcastle/issue-2-x']);
    expect(currentBranch(dir)).toBe('sandcastle/issue-2-x');

    // Act
    restoreHostBranch('main', dir);

    // Assert
    expect(currentBranch(dir)).toBe('main');
  });

  it('is a no-op when already on the starting branch', () => {
    // Arrange & Act — must not throw or change anything.
    restoreHostBranch('main', dir);

    // Assert
    expect(currentBranch(dir)).toBe('main');
  });

  it('does not force-discard uncommitted work when the switch would conflict', () => {
    // Arrange — main and the feature branch hold DIFFERENT committed content for
    // one file, and the feature working tree has an uncommitted edit to it. A
    // plain `git checkout main` then refuses ("local changes would be
    // overwritten"). restoreHostBranch must warn and stay put — never
    // `checkout --force`.
    fs.writeFileSync(path.join(dir, 'shared.txt'), 'main\n');
    git(dir, ['add', 'shared.txt']);
    git(dir, ['commit', '-q', '-m', 'main shared']);
    git(dir, ['checkout', '-q', '-b', 'sandcastle/issue-3-y']);
    fs.writeFileSync(path.join(dir, 'shared.txt'), 'feature\n');
    git(dir, ['commit', '-qa', '-m', 'feature shared']);
    fs.writeFileSync(path.join(dir, 'shared.txt'), 'uncommitted\n');

    // Act — the helper swallows git's refusal into a warning.
    expect(() => restoreHostBranch('main', dir)).not.toThrow();

    // Assert — still on the feature branch, uncommitted work intact.
    expect(currentBranch(dir)).toBe('sandcastle/issue-3-y');
    expect(fs.readFileSync(path.join(dir, 'shared.txt'), 'utf8')).toBe('uncommitted\n');
  });
});
