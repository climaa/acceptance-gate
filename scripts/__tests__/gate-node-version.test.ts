import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

// @ts-expect-error — plain .mjs with JSDoc types, no declaration file.
import { compareNodeVersion, readNvmrc } from '../gate/node-version.mjs';

/**
 * The gate runs on the Node `.nvmrc` declares, or not at all. The receipt it
 * writes vouches for checks whose Intl data and V8 belong to the runtime, so a
 * run on an undeclared Node vouches for less than it says.
 */
describe('compareNodeVersion', () => {
  it('accepts a different patch of the declared major.minor', () => {
    // Arrange
    const nvmrc = '22.23.4\n';
    const running = 'v22.23.1';

    // Act
    const verdict = compareNodeVersion(nvmrc, running);

    // Assert
    expect(verdict).toEqual({ ok: true, declared: '22.23', running: '22.23' });
  });

  it('accepts a leading `v` in .nvmrc, as nvm does', () => {
    // Arrange
    const nvmrc = 'v22.23.4';

    // Act
    const verdict = compareNodeVersion(nvmrc, 'v22.23.4');

    // Assert
    expect(verdict.ok).toBe(true);
  });

  it('refuses a different minor and names both versions and the fix', () => {
    // Arrange
    const nvmrc = '22.23.4';
    const running = 'v22.14.0';

    // Act
    const verdict = compareNodeVersion(nvmrc, running);

    // Assert
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain('v22.14.0');
    expect(verdict.message).toContain('22.23.4');
    expect(verdict.message).toContain('nvm use');
  });

  it('refuses a different major', () => {
    // Arrange
    const nvmrc = '22.23.4';
    const running = 'v26.12.1';

    // Act
    const verdict = compareNodeVersion(nvmrc, running);

    // Assert
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain('v26.12.1');
  });

  it('refuses when .nvmrc is missing', () => {
    // Arrange
    const nvmrc = null;

    // Act
    const verdict = compareNodeVersion(nvmrc, 'v22.23.4');

    // Assert
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain('.nvmrc');
    expect(verdict.message).toContain('missing');
  });

  it('refuses an .nvmrc with no major.minor to compare against', () => {
    // Arrange
    const nvmrc = 'lts/*';

    // Act
    const verdict = compareNodeVersion(nvmrc, 'v22.23.4');

    // Assert
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain('lts/*');
  });

  it('refuses an .nvmrc that is only a major, since the minor is what the ICU data tracks', () => {
    // Arrange
    const nvmrc = '22';

    // Act
    const verdict = compareNodeVersion(nvmrc, 'v22.23.4');

    // Assert
    expect(verdict.ok).toBe(false);
  });

  it('refuses an empty .nvmrc', () => {
    // Arrange
    const nvmrc = '   \n';

    // Act
    const verdict = compareNodeVersion(nvmrc, 'v22.23.4');

    // Assert
    expect(verdict.ok).toBe(false);
  });
});

/**
 * Under `--at`, the receipt is for the commit's tree, so the Node it is checked
 * against is the one that commit declares, not the checkout's.
 */
describe('readNvmrc', () => {
  let root: string | undefined;

  afterEach(() => {
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  /** A one-commit repository whose `.nvmrc` says `committed`, then edited to `working`. */
  function repo(committed: string, working: string): { dir: string; sha: string } {
    const dir = mkdtempSync(join(tmpdir(), 'gate-nvmrc-'));
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
    git('init', '-q');
    writeFileSync(join(dir, '.nvmrc'), committed);
    git('add', '.nvmrc');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'nvmrc');
    writeFileSync(join(dir, '.nvmrc'), working);
    return { dir, sha: git('rev-parse', 'HEAD') };
  }

  it("reads the checkout's file without a revision", () => {
    // Arrange
    const { dir } = repo('22.23.4\n', '22.24.0\n');
    root = dir;

    // Act
    const text = readNvmrc(dir);

    // Assert
    expect(text).toBe('22.24.0\n');
  });

  it('reads the committed file at a revision, whatever the checkout says', () => {
    // Arrange
    const { dir, sha } = repo('22.23.4\n', '22.24.0\n');
    root = dir;

    // Act
    const text = readNvmrc(dir, sha);

    // Assert
    expect(text).toBe('22.23.4\n');
  });

  it('answers missing for a revision that does not exist', () => {
    // Arrange
    const { dir } = repo('22.23.4\n', '22.23.4\n');
    root = dir;

    // Act
    const text = readNvmrc(dir, 'deadbeef');

    // Assert
    expect(text).toBeNull();
  });
});
