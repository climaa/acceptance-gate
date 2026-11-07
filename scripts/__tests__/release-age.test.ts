import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

// @ts-expect-error — plain .mjs with JSDoc types, no declaration file.
import { releaseAgeProblem } from '../release-age.mjs';

/**
 * pnpm-workspace.yaml must hold dependencies back three days: pnpm 11's own
 * default is one, and a key removed or lowered falls back to it silently.
 */
describe('releaseAgeProblem', () => {
  it('passes a workspace file holding the floor', () => {
    // Arrange
    const text = 'packages:\n  - "apps/*"\nminimumReleaseAge: 4320\n';

    // Act
    const problem = releaseAgeProblem(text);

    // Assert
    expect(problem).toBeNull();
  });

  it('passes a value above the floor, with a trailing comment', () => {
    // Arrange
    const text = 'minimumReleaseAge: 10080 # a week\n';

    // Act
    const problem = releaseAgeProblem(text);

    // Assert
    expect(problem).toBeNull();
  });

  it('refuses a file with the key missing', () => {
    // Arrange
    const text = 'packages:\n  - "apps/*"\n';

    // Act
    const problem = releaseAgeProblem(text);

    // Assert
    expect(problem).toMatch(/no minimumReleaseAge/);
  });

  it("refuses pnpm's own default of 1440", () => {
    // Arrange
    const text = 'minimumReleaseAge: 1440\n';

    // Act
    const problem = releaseAgeProblem(text);

    // Assert
    expect(problem).toMatch(/1440, below the floor of 4320/);
  });

  it('refuses a value that is not a number of minutes', () => {
    // Arrange
    const text = 'minimumReleaseAge: three-days\n';

    // Act
    const problem = releaseAgeProblem(text);

    // Assert
    expect(problem).toMatch(/not a number of minutes: three-days/);
  });

  it('does not take the key nested under another one for the setting', () => {
    // Arrange
    const text = 'catalog:\n  minimumReleaseAge: 4320\n';

    // Act
    const problem = releaseAgeProblem(text);

    // Assert
    expect(problem).toMatch(/no minimumReleaseAge/);
  });

  it('refuses the key written twice', () => {
    // Arrange
    const text = 'minimumReleaseAge: 4320\nminimumReleaseAge: 1440\n';

    // Act
    const problem = releaseAgeProblem(text);

    // Assert
    expect(problem).toMatch(/written 2 times/);
  });
});

describe('release-age CLI', () => {
  const SCRIPT = resolve(__dirname, '../release-age.mjs');
  let dir = '';

  afterEach(() => {
    if (dir !== '') rmSync(dir, { recursive: true, force: true });
    dir = '';
  });

  function runOn(text: string) {
    dir = mkdtempSync(join(tmpdir(), 'release-age-'));
    const file = join(dir, 'pnpm-workspace.yaml');
    writeFileSync(file, text);
    return spawnSync(process.execPath, [SCRIPT, file], { encoding: 'utf8' });
  }

  it('exits 0 at 4320', () => {
    // Arrange
    const text = 'minimumReleaseAge: 4320\n';

    // Act
    const result = runOn(text);

    // Assert
    expect(result.status).toBe(0);
  });

  it('exits 1 at 1440 and names the floor', () => {
    // Arrange
    const text = 'minimumReleaseAge: 1440\n';

    // Act
    const result = runOn(text);

    // Assert
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/below the floor of 4320/);
  });

  it("passes on the repository's own pnpm-workspace.yaml", () => {
    // Arrange
    const args = [SCRIPT];

    // Act
    const result = spawnSync(process.execPath, args, { encoding: 'utf8' });

    // Assert
    expect(result.status).toBe(0);
  });
});
