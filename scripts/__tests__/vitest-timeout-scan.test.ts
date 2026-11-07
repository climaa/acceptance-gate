import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

// @ts-expect-error — plain .mjs with JSDoc types, no declaration file.
import { timeoutProblems, vitestConfigs } from '../vitest-timeout-scan.mjs';

/** A config that extends the preset and writes `test` as given. */
function config(test: string): string {
  return [
    "import { defineConfig, mergeConfig } from 'vitest/config';",
    "import { preset } from '../../vitest.shared.mjs';",
    '',
    `export default mergeConfig(preset, defineConfig({ test: { ${test} } }));`,
  ].join('\n');
}

/**
 * Every vitest config extends the root preset, which waits 20 s per test and
 * per hook; a workspace may raise either, never lower it. The scan reads the
 * literal each config writes, as vitest-control-scan reads `.only`.
 */
describe('timeoutProblems', () => {
  it('passes a config that extends the preset and writes no timeout', () => {
    // Arrange
    const text = config("include: ['src/**/*.test.ts']");

    // Act
    const problems = timeoutProblems(text);

    // Assert
    expect(problems).toEqual([]);
  });

  it('passes a timeout at the floor, written with a numeric separator', () => {
    // Arrange
    const text = config('testTimeout: 20_000');

    // Act
    const problems = timeoutProblems(text);

    // Assert
    expect(problems).toEqual([]);
  });

  it('passes a timeout above the floor', () => {
    // Arrange
    const text = config('hookTimeout: 60000');

    // Act
    const problems = timeoutProblems(text);

    // Assert
    expect(problems).toEqual([]);
  });

  it('fails a testTimeout below the floor and names it', () => {
    // Arrange
    const text = config('testTimeout: 5_000');

    // Act
    const problems = timeoutProblems(text);

    // Assert
    expect(problems).toEqual(['testTimeout is 5000 ms, below the preset floor of 20000']);
  });

  it('fails a hookTimeout below the floor: the preset sets both', () => {
    // Arrange
    const text = config('testTimeout: 30_000, hookTimeout: 10_000');

    // Act
    const problems = timeoutProblems(text);

    // Assert
    expect(problems).toEqual([
      'hookTimeout is 10000 ms, below the preset floor of 20000',
    ]);
  });

  it('fails a timeout it cannot read as a number rather than passing it unjudged', () => {
    // Arrange
    const text = config('testTimeout: FIVE_SECONDS');

    // Act
    const problems = timeoutProblems(text);

    // Assert
    expect(problems).toEqual([
      'testTimeout is `FIVE_SECONDS`, not a number literal the scan can judge',
    ]);
  });

  it('fails a config that does not extend the preset: it waits vitest’s 5 s', () => {
    // Arrange
    const text = [
      "import { defineConfig } from 'vitest/config';",
      "export default defineConfig({ test: { environment: 'node' } });",
    ].join('\n');

    // Act
    const problems = timeoutProblems(text);

    // Assert
    expect(problems).toEqual(['does not import the preset from vitest.shared.mjs']);
  });

  it('ignores a timeout named in a comment', () => {
    // Arrange
    const text =
      config("environment: 'node'") + '\n// testTimeout: 5_000 was the old value';

    // Act
    const problems = timeoutProblems(text);

    // Assert
    expect(problems).toEqual([]);
  });
});

describe('vitestConfigs', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('finds each workspace config and the root suite configs, nothing else', () => {
    // Arrange
    dir = mkdtempSync(join(tmpdir(), 'vitest-timeout-scan-'));
    for (const sub of ['apps/a', 'apps/b', 'packages/c', 'apps/a/node_modules/x']) {
      mkdirSync(join(dir, sub), { recursive: true });
    }
    writeFileSync(join(dir, 'apps/a/vitest.config.mts'), '');
    writeFileSync(join(dir, 'apps/a/node_modules/x/vitest.config.ts'), '');
    writeFileSync(join(dir, 'packages/c/vitest.config.ts'), '');
    writeFileSync(join(dir, 'vitest.sandcastle.config.mts'), '');
    writeFileSync(join(dir, 'vitest.shared.mjs'), '');

    // Act
    const files = vitestConfigs(dir).map((file: string) => file.slice(dir!.length + 1));

    // Assert
    expect(files.sort()).toEqual([
      'apps/a/vitest.config.mts',
      'packages/c/vitest.config.ts',
      'vitest.sandcastle.config.mts',
    ]);
  });

  it('finds all nine vitest configs in this repository', () => {
    // Arrange
    const root = resolve(__dirname, '../..');

    // Act
    const files: string[] = vitestConfigs(root);

    // Assert
    expect(files.length).toBeGreaterThanOrEqual(9);
  });
});

/** Exit 0 clean, 1 a config below the floor, 2 nothing to judge. */
describe('vitest-timeout-scan CLI', () => {
  const SCRIPT = resolve(__dirname, '../vitest-timeout-scan.mjs');
  let dir: string | undefined;

  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  function scan(text: string | null) {
    dir = mkdtempSync(join(tmpdir(), 'vitest-timeout-scan-cli-'));
    const file = join(dir, 'vitest.config.ts');
    if (text !== null) writeFileSync(file, text);
    return spawnSync(process.execPath, [SCRIPT, file], { encoding: 'utf8' });
  }

  it('exits 0 on a config at the floor', () => {
    // Arrange
    const text = config('testTimeout: 20_000');

    // Act
    const run = scan(text);

    // Assert
    expect(run.status).toBe(0);
  });

  it('exits 1 on a config below the floor, naming the file', () => {
    // Arrange
    const text = config('testTimeout: 5_000');

    // Act
    const run = scan(text);

    // Assert
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/vitest\.config\.ts — testTimeout is 5000 ms/);
  });

  it('exits 2 on a file that does not exist', () => {
    // Arrange
    const text = null;

    // Act
    const run = scan(text);

    // Assert
    expect(run.status).toBe(2);
  });

  it('exits 0 on this repository: every config extends the preset', () => {
    // Arrange
    const args = [SCRIPT];

    // Act
    const run = spawnSync(process.execPath, args, { encoding: 'utf8' });

    // Assert
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
  });
});
