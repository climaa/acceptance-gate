import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  type MergeIO,
  resolveAdditive,
  resolveDirtyBranch,
  ungatedPush,
} from '../sandcastle-additive-merge.mts';

/**
 * The one conflict the PR queue resolves: two branches that each added lines
 * under `## Unreleased` in CHANGELOG.md. Everything else — another file, an
 * edited line, a lockfile that no longer installs — stays a human's.
 */
describe('resolveAdditive', () => {
  it('keeps both additions, the branch’s first, as CHANGELOG adds its newest on top', () => {
    // Arrange
    const text = [
      '## Unreleased',
      '',
      '<<<<<<< HEAD',
      '- branch entry',
      '',
      '||||||| 037c6d8',
      '=======',
      '- main entry',
      '',
      '>>>>>>> origin/main',
      '- old',
    ].join('\n');

    // Act
    const resolution = resolveAdditive('CHANGELOG.md', text);

    // Assert
    expect(resolution).toEqual({
      ok: true,
      text: ['## Unreleased', '', '- branch entry', '', '- main entry', '', '- old'].join(
        '\n',
      ),
    });
  });

  it('refuses a hunk where a side changed a line that was there', () => {
    // Arrange
    const text = [
      '<<<<<<< HEAD',
      '- old, reworded on the branch',
      '||||||| 037c6d8',
      '- old',
      '=======',
      '- old, reworded on main',
      '>>>>>>> origin/main',
    ].join('\n');

    // Act
    const resolution = resolveAdditive('CHANGELOG.md', text);

    // Assert
    expect(resolution).toEqual({
      ok: false,
      reason:
        'CHANGELOG.md has a hunk where a side changed an existing line; only pure additions are resolved',
    });
  });

  it('refuses a conflict not written in diff3 style, which hides the ancestor', () => {
    // Arrange
    const text = ['<<<<<<< HEAD', '- a', '=======', '- b', '>>>>>>> origin/main'].join(
      '\n',
    );

    // Act
    const resolution = resolveAdditive('CHANGELOG.md', text);

    // Assert
    expect(resolution.ok).toBe(false);
  });

  it('refuses a hunk that never closes', () => {
    // Arrange
    const text = ['<<<<<<< HEAD', '- a', '||||||| base', '=======', '- b'].join('\n');

    // Act
    const resolution = resolveAdditive('CHANGELOG.md', text);

    // Assert
    expect(resolution).toEqual({
      ok: false,
      reason: 'CHANGELOG.md has a malformed conflict; refusing',
    });
  });

  it('refuses a hunk with a second split, such as a setext underline in an entry', () => {
    // Arrange
    const text = [
      '<<<<<<< HEAD',
      '- a',
      '||||||| base',
      '=======',
      'Title',
      '=======',
      '>>>>>>> origin/main',
    ].join('\n');

    // Act
    const resolution = resolveAdditive('CHANGELOG.md', text);

    // Assert
    expect(resolution.ok).toBe(false);
  });

  it('refuses a file with no conflict in it', () => {
    // Arrange
    const text = '## Unreleased\n';

    // Act
    const resolution = resolveAdditive('CHANGELOG.md', text);

    // Assert
    expect(resolution.ok).toBe(false);
  });
});

describe('resolveDirtyBranch', () => {
  let scratch: string | undefined;

  afterEach(() => {
    if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true });
    scratch = undefined;
  });

  type Files = Record<string, string>;

  /**
   * A bare `origin` and a host clone. `main` and `branch` both start from
   * `base`, then each commits its own edits: the shape of two PRs cut from the
   * same main, one of which merged first.
   */
  function crossed(base: Files, onMain: Files, onBranch: Files) {
    scratch = mkdtempSync(join(tmpdir(), 'additive-merge-'));
    const origin = join(scratch, 'origin.git');
    const host = join(scratch, 'host');
    const git = (cwd: string, ...args: string[]) =>
      execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
    const commit = (files: Files, message: string) => {
      for (const [file, text] of Object.entries(files))
        writeFileSync(join(host, file), text);
      git(host, 'add', '-A');
      git(host, 'commit', '-qm', message);
    };

    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
    execFileSync('git', ['clone', '-q', origin, host]);
    git(host, 'config', 'user.name', 'test');
    git(host, 'config', 'user.email', 'test@example.com');
    commit(base, 'base');
    git(host, 'push', '-q', 'origin', 'HEAD:main');
    git(host, 'checkout', '-qb', 'branch');
    commit(onBranch, 'branch');
    git(host, 'push', '-q', 'origin', 'branch');
    git(host, 'checkout', '-q', 'main');
    commit(onMain, 'main');
    git(host, 'push', '-q', 'origin', 'main');

    const pushed: string[] = [];
    const installs: string[] = [];
    const io = (installs_ok = true): MergeIO => ({
      install: (dir) => {
        installs.push(dir);
        return installs_ok;
      },
      push: (sha, branch) => {
        pushed.push(sha);
        git(host, 'push', '-q', 'origin', `${sha}:refs/heads/${branch}`);
        return true;
      },
    });
    const show = (ref: string, file: string) => git(host, 'show', `${ref}:${file}`);
    return { host, io, pushed, installs, show, git };
  }

  const changelog = (...entries: string[]) =>
    [
      '# Changelog',
      '',
      '## Unreleased',
      '',
      ...entries.flatMap((e) => [e, '']),
      '- old',
      '',
    ].join('\n');

  it('resolves a CHANGELOG-only conflict to both entries and pushes the merge', () => {
    // Arrange
    const repo = crossed(
      { 'CHANGELOG.md': changelog() },
      { 'CHANGELOG.md': changelog('- main entry') },
      { 'CHANGELOG.md': changelog('- branch entry') },
    );

    // Act
    const outcome = resolveDirtyBranch('branch', repo.host, repo.io());

    // Assert
    expect(outcome.ok).toBe(true);
    expect(repo.pushed).toHaveLength(1);
    repo.git(repo.host, 'fetch', '-q', 'origin');
    expect(repo.show('origin/branch', 'CHANGELOG.md')).toBe(
      changelog('- branch entry', '- main entry').trimEnd(),
    );
    expect(
      repo.git(repo.host, 'rev-list', '--parents', '-n1', 'origin/branch').split(' '),
    ).toHaveLength(3);
  });

  it('leaves a PR for a human when a source file conflicts alongside CHANGELOG.md', () => {
    // Arrange
    const repo = crossed(
      { 'CHANGELOG.md': changelog(), 'a.ts': 'export const a = 1;\n' },
      { 'CHANGELOG.md': changelog('- main entry'), 'a.ts': 'export const a = 2;\n' },
      { 'CHANGELOG.md': changelog('- branch entry'), 'a.ts': 'export const a = 3;\n' },
    );

    // Act
    const outcome = resolveDirtyBranch('branch', repo.host, repo.io());

    // Assert
    expect(outcome).toEqual({
      ok: false,
      reason: 'conflict in a.ts, which the queue never resolves',
    });
    expect(repo.pushed).toEqual([]);
  });

  it('refuses an edit-versus-edit hunk inside CHANGELOG.md', () => {
    // Arrange
    const repo = crossed(
      { 'CHANGELOG.md': changelog() },
      { 'CHANGELOG.md': changelog().replace('- old', '- old, reworded on main') },
      { 'CHANGELOG.md': changelog().replace('- old', '- old, reworded on the branch') },
    );

    // Act
    const outcome = resolveDirtyBranch('branch', repo.host, repo.io());

    // Assert
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? '' : outcome.reason).toMatch(/only pure additions/);
    expect(repo.pushed).toEqual([]);
  });

  it('leaves a PR for a human when the merged lockfile no longer installs frozen', () => {
    // Arrange — main moved the lockfile; the merge brings it into the branch.
    const repo = crossed(
      { 'CHANGELOG.md': changelog(), 'pnpm-lock.yaml': 'lockfileVersion: 9.0\n' },
      {
        'CHANGELOG.md': changelog('- main entry'),
        'pnpm-lock.yaml': 'lockfileVersion: 9.1\n',
      },
      { 'CHANGELOG.md': changelog('- branch entry') },
    );

    // Act
    const outcome = resolveDirtyBranch('branch', repo.host, repo.io(false));

    // Assert
    expect(outcome).toEqual({
      ok: false,
      reason: 'pnpm-lock.yaml changed in the merge and no longer installs frozen',
    });
    expect(repo.installs).toHaveLength(1);
    expect(repo.pushed).toEqual([]);
  });

  it('does not install when the merge leaves the lockfile as the branch had it', () => {
    // Arrange
    const repo = crossed(
      { 'CHANGELOG.md': changelog(), 'pnpm-lock.yaml': 'lockfileVersion: 9.0\n' },
      { 'CHANGELOG.md': changelog('- main entry') },
      { 'CHANGELOG.md': changelog('- branch entry') },
    );

    // Act
    const outcome = resolveDirtyBranch('branch', repo.host, repo.io(false));

    // Assert
    expect(outcome.ok).toBe(true);
    expect(repo.installs).toEqual([]);
  });

  it('refuses a CHANGELOG.md deleted on one side and edited on the other', () => {
    // Arrange — a modify/delete conflict names the path with no file behind it.
    const repo = crossed(
      { 'CHANGELOG.md': changelog(), 'keep.txt': '1\n' },
      { 'keep.txt': '2\n' },
      { 'CHANGELOG.md': changelog('- branch entry') },
    );
    repo.git(repo.host, 'rm', '-q', 'CHANGELOG.md');
    repo.git(repo.host, 'commit', '-qm', 'drop changelog');
    repo.git(repo.host, 'push', '-q', 'origin', 'main');

    // Act
    const outcome = resolveDirtyBranch('branch', repo.host, repo.io());

    // Assert
    expect(outcome).toEqual({
      ok: false,
      reason: 'CHANGELOG.md was deleted on one side; refusing',
    });
    expect(repo.pushed).toEqual([]);
  });

  it('leaves no scratch worktree behind', () => {
    // Arrange
    const repo = crossed(
      { 'CHANGELOG.md': changelog(), 'a.ts': '1\n' },
      { 'a.ts': '2\n' },
      { 'a.ts': '3\n' },
    );

    // Act
    resolveDirtyBranch('branch', repo.host, repo.io());

    // Assert
    expect(repo.git(repo.host, 'worktree', 'list').split('\n')).toHaveLength(1);
  });
});

describe('ungatedPush', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  /** A repository whose hooks live in `.husky/_`, with or without a pre-push. */
  function repoWithHooks(prePush: boolean): string {
    const root = mkdtempSync(join(tmpdir(), 'additive-merge-hooks-'));
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['config', 'core.hooksPath', '.husky/_'], { cwd: root });
    mkdirSync(join(root, '.husky/_'), { recursive: true });
    if (prePush) writeFileSync(join(root, '.husky/_/pre-push'), '#!/bin/sh\n');
    return root;
  }

  it('lets a push through where the pre-push hook is installed', () => {
    // Arrange
    dir = repoWithHooks(true);

    // Act
    const reason = ungatedPush(dir, {});

    // Assert
    expect(reason).toBeNull();
  });

  it('refuses a push where no pre-push hook is installed, as in a fresh worktree', () => {
    // Arrange
    dir = repoWithHooks(false);

    // Act
    const reason = ungatedPush(dir, {});

    // Assert
    expect(reason).toMatch(/no pre-push hook in \.husky\/_/);
  });

  it('refuses a push that SC_SKIP_GATE would leave ungated', () => {
    // Arrange
    dir = repoWithHooks(true);

    // Act
    const reason = ungatedPush(dir, { SC_SKIP_GATE: '1' });

    // Assert
    expect(reason).toMatch(/SC_SKIP_GATE/);
  });
});
