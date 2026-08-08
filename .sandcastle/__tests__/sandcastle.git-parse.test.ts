import {
  parseBranchList,
  parseDirtiness,
  parseIssueIdFromBranch,
  parseIssueJson,
  parsePositiveCount,
  parsePrimaryWorktree,
  parseWorktreeForBranch,
} from '../sandcastle-git-parse.mts';

/**
 * REAL unit tests, not source-text assertions.
 *
 * sandcastle-git.mts held 11 execSync calls — 42% of every side effect in
 * .sandcastle/ — and fan-in of 4, with no behavioral test on any of it, because
 * the parsing was welded to the shelling-out. This module is that parsing,
 * split out the same way sandcastle-worktree-safety.mts was.
 *
 * What is being protected: every one of these parsers sits behind a `catch`
 * that returns a benign default (null / false / []). A parsing bug therefore
 * does not throw — it silently reports "no commits ahead", "no worktree", or an
 * issue with no labels. The last one is the dangerous case: labels carry the
 * sc:* model overrides, so an issue that parses half-way would quietly run on
 * the wrong model.
 */

describe('parsePositiveCount', () => {
  it('reads a positive count as true', () => {
    // Arrange & Act & Assert
    expect(parsePositiveCount('3')).toBe(true);
  });

  it('reads zero as false', () => {
    // Arrange & Act & Assert
    expect(parsePositiveCount('0')).toBe(false);
  });

  it('tolerates the trailing newline git actually emits', () => {
    // Arrange & Act & Assert
    expect(parsePositiveCount('2\n')).toBe(true);
  });

  it('treats empty output as false rather than NaN', () => {
    // Arrange & Act & Assert — Number('') is 0, but Number('fatal: ...') is
    // NaN, and NaN > 0 is false only by luck of JS semantics. Pin it, because
    // the caller reads true as "there is work to merge".
    expect(parsePositiveCount('')).toBe(false);
    expect(parsePositiveCount('   ')).toBe(false);
  });

  it('treats non-numeric output as false', () => {
    // Arrange & Act & Assert
    expect(parsePositiveCount('fatal: bad revision')).toBe(false);
  });

  it('does not accept a negative count', () => {
    // Arrange & Act & Assert
    expect(parsePositiveCount('-1')).toBe(false);
  });
});

describe('parseBranchList', () => {
  it('splits one branch per line', () => {
    // Arrange
    const stdout = 'sandcastle/issue-1-a\nsandcastle/issue-2-b\n';

    // Act
    const branches = parseBranchList(stdout);

    // Assert
    expect(branches).toEqual(['sandcastle/issue-1-a', 'sandcastle/issue-2-b']);
  });

  it('returns empty for no branches', () => {
    // Arrange & Act & Assert
    expect(parseBranchList('')).toEqual([]);
    expect(parseBranchList('\n\n')).toEqual([]);
  });

  it('passes a quoted ref through unchanged', () => {
    // Arrange — pinned as a non-behavior: the shell eats the --format quotes
    // before git sees them, so refs arrive bare. Anything that does arrive
    // quoted is a real ref name and must survive intact.
    const stdout = "'sandcastle/issue-9-x'\n";

    // Act
    const branches = parseBranchList(stdout);

    // Assert
    expect(branches).toEqual(["'sandcastle/issue-9-x'"]);
  });
});

describe('parseIssueIdFromBranch', () => {
  it('extracts the id from the documented branch format', () => {
    // Arrange & Act & Assert
    expect(parseIssueIdFromBranch('sandcastle/issue-42-fix-auth-bug')).toBe('42');
  });

  it('handles multi-digit ids', () => {
    // Arrange & Act & Assert
    expect(parseIssueIdFromBranch('sandcastle/issue-475-readme')).toBe('475');
  });

  it('rejects branches outside the sandcastle namespace', () => {
    // Arrange & Act & Assert
    expect(parseIssueIdFromBranch('chore/tooling-fallow-fixes')).toBeNull();
    expect(parseIssueIdFromBranch('main')).toBeNull();
  });

  it('rejects a sandcastle branch with no issue number', () => {
    // Arrange & Act & Assert
    expect(parseIssueIdFromBranch('sandcastle/hotfix')).toBeNull();
    expect(parseIssueIdFromBranch('sandcastle/issue-abc-x')).toBeNull();
  });

  it('requires the trailing slug separator', () => {
    // Arrange & Act & Assert
    expect(parseIssueIdFromBranch('sandcastle/issue-42')).toBeNull();
  });
});

describe('parseIssueJson', () => {
  it('reads title, state and label names', () => {
    // Arrange
    const stdout = JSON.stringify({
      title: 'Fix auth bug',
      state: 'OPEN',
      labels: [{ name: 'bug' }, { name: 'sc:implementer:sonnet-5' }],
    });

    // Act
    const issue = parseIssueJson(stdout);

    // Assert
    expect(issue).toEqual({
      title: 'Fix auth bug',
      state: 'OPEN',
      labels: ['bug', 'sc:implementer:sonnet-5'],
    });
  });

  it('returns an empty label list when the issue has none', () => {
    // Arrange
    const stdout = JSON.stringify({ title: 't', state: 'OPEN', labels: [] });

    // Act
    const issue = parseIssueJson(stdout);

    // Assert
    expect(issue?.labels).toEqual([]);
  });

  it('tolerates a missing labels key', () => {
    // Arrange
    const stdout = JSON.stringify({ title: 't', state: 'OPEN' });

    // Act
    const issue = parseIssueJson(stdout);

    // Assert
    expect(issue?.labels).toEqual([]);
  });

  it('drops label entries with no name rather than emitting undefined', () => {
    // Arrange
    const stdout = JSON.stringify({
      title: 't',
      state: 'OPEN',
      labels: [{ name: 'keep' }, {}, { name: '' }],
    });

    // Act
    const issue = parseIssueJson(stdout);

    // Assert
    expect(issue?.labels).toEqual(['keep']);
  });

  it('returns null on malformed JSON', () => {
    // Arrange & Act & Assert — must NOT produce a valid-looking issue: the
    // caller reads .labels to resolve model overrides, so "parsed but empty"
    // is a silent downgrade to the expensive default.
    expect(parseIssueJson('not json')).toBeNull();
    expect(parseIssueJson('')).toBeNull();
  });

  it('returns null when title or state is absent', () => {
    // Arrange & Act & Assert
    expect(parseIssueJson(JSON.stringify({ state: 'OPEN' }))).toBeNull();
    expect(parseIssueJson(JSON.stringify({ title: 't' }))).toBeNull();
  });

  it('returns null for a JSON literal that is not an object', () => {
    // Arrange & Act & Assert
    expect(parseIssueJson('null')).toBeNull();
    expect(parseIssueJson('42')).toBeNull();
  });
});

describe('parsePrimaryWorktree', () => {
  const PORCELAIN = [
    'worktree /repo/acceptance-gate',
    'HEAD abc123',
    'branch refs/heads/main',
    '',
    'worktree /repo/.sandcastle/worktrees/issue-1',
    'HEAD def456',
    'branch refs/heads/sandcastle/issue-1-a',
    '',
  ].join('\n');

  it('returns the first worktree entry', () => {
    // Arrange & Act — git documents the primary checkout as reported first,
    // and the reaper trusts that ordering to identify the one path it must
    // never remove.
    const primary = parsePrimaryWorktree(PORCELAIN);

    // Assert
    expect(primary).toBe('/repo/acceptance-gate');
  });

  it('returns null when there is no worktree line', () => {
    // Arrange & Act & Assert
    expect(parsePrimaryWorktree('')).toBeNull();
    expect(parsePrimaryWorktree('HEAD abc\nbranch refs/heads/main')).toBeNull();
  });

  it('returns null rather than an empty string for a bare worktree line', () => {
    // Arrange & Act & Assert
    expect(parsePrimaryWorktree('worktree \n')).toBeNull();
  });
});

describe('parseWorktreeForBranch', () => {
  const PORCELAIN = [
    'worktree /repo/acceptance-gate',
    'HEAD abc123',
    'branch refs/heads/main',
    '',
    'worktree /repo/.sandcastle/worktrees/issue-7',
    'HEAD def456',
    'branch refs/heads/sandcastle/issue-7-slug',
    '',
  ].join('\n');

  it('finds the worktree holding a branch', () => {
    // Arrange & Act
    const path = parseWorktreeForBranch(PORCELAIN, 'sandcastle/issue-7-slug');

    // Assert
    expect(path).toBe('/repo/.sandcastle/worktrees/issue-7');
  });

  it('finds the primary worktree by its branch', () => {
    // Arrange & Act
    const path = parseWorktreeForBranch(PORCELAIN, 'main');

    // Assert
    expect(path).toBe('/repo/acceptance-gate');
  });

  it('returns null for a branch that is not checked out anywhere', () => {
    // Arrange & Act
    const path = parseWorktreeForBranch(PORCELAIN, 'sandcastle/issue-99-nope');

    // Assert
    expect(path).toBeNull();
  });

  it('attributes each branch to its own worktree record', () => {
    // Arrange & Act — a branch line belongs to whichever `worktree ` record is
    // open above it. Matching on branch alone would return the wrong path.
    const path = parseWorktreeForBranch(PORCELAIN, 'sandcastle/issue-7-slug');

    // Assert
    expect(path).not.toBe('/repo/acceptance-gate');
  });

  it('ignores a detached-HEAD record with no branch line', () => {
    // Arrange
    const detached = ['worktree /repo/detached', 'HEAD abc123', 'detached', ''].join(
      '\n',
    );

    // Act
    const path = parseWorktreeForBranch(detached, 'main');

    // Assert
    expect(path).toBeNull();
  });

  it('returns null on empty output', () => {
    // Arrange & Act & Assert
    expect(parseWorktreeForBranch('', 'main')).toBeNull();
  });
});

describe('parseDirtiness', () => {
  it('reads any porcelain output as dirty', () => {
    // Arrange & Act & Assert
    expect(parseDirtiness(' M src/index.ts\n')).toBe('dirty');
    expect(parseDirtiness('?? untracked.txt\n')).toBe('dirty');
  });

  it('reads empty output as clean', () => {
    // Arrange & Act & Assert
    expect(parseDirtiness('')).toBe('clean');
    expect(parseDirtiness('\n  \n')).toBe('clean');
  });

  it('never reports unreadable from output alone', () => {
    // Arrange & Act & Assert — "unreadable" means the command failed, which
    // only the IO wrapper's catch can observe.
    expect(parseDirtiness('anything')).not.toBe('unreadable');
  });
});
