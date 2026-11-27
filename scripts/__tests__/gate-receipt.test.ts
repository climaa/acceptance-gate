import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// @ts-expect-error — plain .mjs with JSDoc types, no declaration file.
import { findReceipt, NOTES_REF } from '../gate/receipt.mjs';

/**
 * Asking whether a tree was ever verified. `findReceipt` looks for a receipt
 * that names the ref's TREE anywhere in `refs/notes/gate`, not only on the ref's
 * own commit, so a squash-merge that kept the tree keeps its receipt. When a tree
 * carries more than one, the full tier wins over the fast one.
 *
 * It runs in process, so v8 coverage sees it, against a throwaway repository the
 * test points git at through `GIT_DIR` and `GIT_WORK_TREE`: `receipt.mjs` calls
 * git with no `cwd`, and the environment is what its child processes inherit.
 */
const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Gate Test',
  GIT_AUTHOR_EMAIL: 'gate@test.invalid',
  GIT_COMMITTER_NAME: 'Gate Test',
  GIT_COMMITTER_EMAIL: 'gate@test.invalid',
};

const SCOPED = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', ...Object.keys(GIT_ENV)];

describe('findReceipt', () => {
  let repo: string;
  let saved: Record<string, string | undefined>;

  const git = (...args: string[]) =>
    execFileSync('git', args, { encoding: 'utf8' }).trim();

  /** A commit with `content` in one file; two commits with the same content
   *  share a tree, which is what a squash-merge of a branch tip looks like. */
  const commit = (content: string, message: string) => {
    git('checkout', '--quiet', '--orphan', `b-${message}`);
    git('rm', '-r', '--quiet', '--cached', '--ignore-unmatch', '.');
    execFileSync('sh', [
      '-c',
      `printf %s "$1" > "$2"`,
      'sh',
      content,
      join(repo, 'file'),
    ]);
    git('add', 'file');
    git('commit', '--quiet', '-m', message);
    return git('rev-parse', 'HEAD');
  };

  const treeOf = (sha: string) => git('rev-parse', `${sha}^{tree}`);

  const note = (sha: string, body: string) =>
    git('notes', `--ref=${NOTES_REF}`, 'add', '-f', '-m', body, sha);

  beforeEach(() => {
    saved = Object.fromEntries(SCOPED.map((name) => [name, process.env[name]]));
    repo = mkdtempSync(join(tmpdir(), 'gate-receipt-'));
    execFileSync('git', ['init', '--quiet', repo]);
    Object.assign(process.env, GIT_ENV, {
      GIT_DIR: join(repo, '.git'),
      GIT_WORK_TREE: repo,
    });
    delete process.env.GIT_INDEX_FILE;
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(repo, { recursive: true, force: true });
  });

  it('answers null when no commit carries a receipt', () => {
    // Arrange
    const head = commit('a', 'only');

    // Act
    const found = findReceipt(head);

    // Assert
    expect(found).toBeNull();
  });

  it('answers null when every receipt names another tree', () => {
    // Arrange
    const other = commit('other', 'other');
    note(other, JSON.stringify({ tree: treeOf(other), tier: 'full' }));
    const head = commit('a', 'head');

    // Act
    const found = findReceipt(head);

    // Assert
    expect(found).toBeNull();
  });

  it('skips a note that is not a receipt', () => {
    // Arrange
    const head = commit('a', 'head');
    note(head, 'not json');

    // Act
    const found = findReceipt(head);

    // Assert
    expect(found).toBeNull();
  });

  it('finds the receipt of another commit with the same tree, read as fast when it names no tier', () => {
    // Arrange: the branch tip carries the receipt; the squash-merge does not.
    const tip = commit('a', 'tip');
    note(tip, JSON.stringify({ tree: treeOf(tip), at: '2026-11-27T00:00:00.000Z' }));
    const squashed = commit('a', 'squashed');

    // Act
    const found = findReceipt(squashed);

    // Assert
    expect(found).toEqual({ sha: tip, at: '2026-11-27T00:00:00.000Z', tier: 'fast' });
  });

  it('keeps the tier a receipt names', () => {
    // Arrange
    const head = commit('a', 'head');
    note(head, JSON.stringify({ tree: treeOf(head), at: 'then', tier: 'full' }));

    // Act
    const found = findReceipt(head);

    // Assert
    expect(found).toEqual({ sha: head, at: 'then', tier: 'full' });
  });

  it('prefers a full receipt over a fast one for the same tree, whatever the order', () => {
    // Arrange: one fast and one full receipt on two commits sharing a tree.
    const first = commit('a', 'first');
    const second = commit('a', 'second');
    const tree = treeOf(first);
    note(first, JSON.stringify({ tree, at: 'fast-at', tier: 'fast' }));
    note(second, JSON.stringify({ tree, at: 'full-at', tier: 'full' }));
    const third = commit('a', 'third');
    note(third, JSON.stringify({ tree, at: 'fast-again', tier: 'fast' }));

    // Act
    const found = findReceipt(third);

    // Assert
    expect(found).toEqual({ sha: second, at: 'full-at', tier: 'full' });
  });
});
