import {
  formatMs,
  isDocsOnlyFileList,
  parseTurboStats,
} from '../sandcastle-build-verify.mts';

/**
 * REAL unit tests for build-verify's pure decisions. isDocsOnlyFileList gates
 * whether a branch's diff skips the expensive `pnpm build` — a false positive
 * would skip building real code — yet it was previously reachable only through
 * an execSync `git diff`, so the suite regex-asserted its source. parseTurboStats
 * and formatMs are pure too and were untested.
 */

describe('isDocsOnlyFileList', () => {
  it('treats an empty list as docs-only (nothing changed, nothing to build)', () => {
    // Arrange & Act & Assert
    expect(isDocsOnlyFileList([])).toBe(true);
  });

  it('accepts every docs-only pattern', () => {
    // Arrange & Act & Assert
    expect(
      isDocsOnlyFileList([
        'README.md',
        'guide.mdx',
        'docs/anything.png',
        '.github/workflows/pr.yml',
        '.sandcastle/README.md',
        'LICENSE',
        '.gitignore',
      ]),
    ).toBe(true);
  });

  it('requires ALL files to be docs-only — one code file forces a build', () => {
    // Arrange & Act & Assert
    expect(isDocsOnlyFileList(['README.md', 'src/index.ts'])).toBe(false);
    expect(isDocsOnlyFileList(['src/index.ts'])).toBe(false);
  });

  it('treats any .md/.mdx as docs-only regardless of directory', () => {
    // Arrange & Act & Assert — the broad /\.mdx?$/ pattern matches markdown
    // anywhere, so even a nested agent prompt skips the build. Pinned because it
    // is easy to misread the narrower `.sandcastle/<file>.md` pattern as the
    // only markdown rule.
    expect(isDocsOnlyFileList(['.sandcastle/agent-docs/plan-prompt.md'])).toBe(true);
    expect(isDocsOnlyFileList(['apps/blog/content/post.mdx'])).toBe(true);
  });
});

describe('parseTurboStats', () => {
  it('reads the tasks and cached counts from turbo output', () => {
    // Arrange
    const output = [
      'some build noise',
      'Tasks:    5 successful, 5 total',
      'Cached:    3 cached, 5 total',
      'Time:    2s',
    ].join('\n');

    // Act
    const stats = parseTurboStats(output);

    // Assert
    expect(stats).toEqual({ successful: 5, total: 5, cached: 3 });
  });

  it('returns null when the tasks line is absent', () => {
    // Arrange & Act & Assert
    expect(parseTurboStats('Cached: 1 cached, 1 total')).toBeNull();
  });

  it('returns null when the cached line is absent', () => {
    // Arrange & Act & Assert
    expect(parseTurboStats('Tasks: 1 successful, 1 total')).toBeNull();
  });

  it('returns null on unrelated output', () => {
    // Arrange & Act & Assert
    expect(parseTurboStats('build failed with an error')).toBeNull();
  });
});

describe('formatMs', () => {
  it('formats sub-minute durations as seconds', () => {
    // Arrange & Act & Assert
    expect(formatMs(0)).toBe('0s');
    expect(formatMs(3000)).toBe('3s');
  });

  it('formats minute-plus durations as m and zero-padded s', () => {
    // Arrange & Act & Assert
    expect(formatMs(65000)).toBe('1m05s');
    expect(formatMs(600000)).toBe('10m00s');
  });
});
