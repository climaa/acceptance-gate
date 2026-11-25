import { describe, expect, it } from 'vitest';

// @ts-expect-error — plain .mjs with JSDoc types, no declaration file.
import * as integrity from '../index-integrity.mjs';

const { indexProblems, statedBaselines, statedVersion } = integrity;

const indexOf = (stamp: string, ...claims: number[]) =>
  [
    '# Project Index',
    stamp,
    '',
    ...claims.map((count) => `- ${count} committed baselines`),
  ].join('\n');

describe('statedVersion', () => {
  it('reads the version and the line the stamp sits on', () => {
    // Arrange
    const index = indexOf('Version 1.10.2 · generated 2026-11-25');

    // Act
    const stamp = statedVersion(index);

    // Assert
    expect(stamp).toEqual({ version: '1.10.2', line: 2 });
  });

  it('finds no stamp without its generated date', () => {
    // Arrange
    const index = indexOf('Version 1.10.2');

    // Act
    const stamp = statedVersion(index);

    // Assert
    expect(stamp).toBeNull();
  });
});

describe('statedBaselines', () => {
  it('reads every claim with its line', () => {
    // Arrange
    const index = indexOf('Version 1.10.2 · generated 2026-11-25', 374, 372);

    // Act
    const claims = statedBaselines(index);

    // Assert
    expect(claims).toEqual([
      { count: 374, line: 4 },
      { count: 372, line: 5 },
    ]);
  });
});

describe('indexProblems', () => {
  const STAMP = 'Version 1.10.2 · generated 2026-11-25';

  it('finds none when the stamp and every claim agree', () => {
    // Arrange
    const index = indexOf(STAMP, 374, 374);

    // Act
    const problems = indexProblems(index, '1.10.2', 374);

    // Assert
    expect(problems).toEqual([]);
  });

  it('says the manifest has no version for the stamp to agree with', () => {
    // Arrange
    const index = indexOf(STAMP, 374);

    // Act
    const problems = indexProblems(index, undefined, 374);

    // Assert
    expect(problems).toEqual([
      'package.json has no `version`, so the stamp has nothing to agree with',
    ]);
  });

  it('says the index carries no stamp', () => {
    // Arrange
    const index = indexOf('Version 1.10.2', 374);

    // Act
    const problems = indexProblems(index, '1.10.2', 374);

    // Assert
    expect(problems).toEqual([
      'PROJECT_INDEX.md — no `Version X.Y.Z · generated YYYY-MM-DD` stamp found',
    ]);
  });

  it('names the stamp’s line and both versions, and points at RELEASING.md', () => {
    // Arrange
    const index = indexOf('Version 1.10.1 · generated 2026-11-20', 374);

    // Act
    const problems = indexProblems(index, '1.10.2', 374);

    // Assert
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(
      /^PROJECT_INDEX\.md:2 — stamped 1\.10\.1, package\.json says 1\.10\.2\.\n/,
    );
    expect(problems[0]).toContain('RELEASING.md step 4 lists the commands.');
  });

  it('says the index claims no baseline count', () => {
    // Arrange
    const index = indexOf(STAMP);

    // Act
    const problems = indexProblems(index, '1.10.2', 374);

    // Assert
    expect(problems).toEqual([
      'PROJECT_INDEX.md — no `N committed baselines` claim found',
    ]);
  });

  it('names each claim that disagrees with git, and only those', () => {
    // Arrange
    const index = indexOf(STAMP, 374, 372);

    // Act
    const problems = indexProblems(index, '1.10.2', 374);

    // Assert
    expect(problems).toEqual([
      'PROJECT_INDEX.md:5 — claims 372 committed baselines, git tracks 374',
    ]);
  });

  it('reports a stale stamp and a stale count together', () => {
    // Arrange
    const index = indexOf('Version 1.10.1 · generated 2026-11-20', 372);

    // Act
    const problems = indexProblems(index, '1.10.2', 374);

    // Assert
    expect(problems).toHaveLength(2);
  });
});
