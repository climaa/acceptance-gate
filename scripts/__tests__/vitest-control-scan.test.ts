import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

// @ts-expect-error — plain .mjs with JSDoc types, no declaration file.
import { controlCalls, scannedFiles } from '../vitest-control-scan.mjs';

/**
 * The unit tests are scanned for Vitest's control vocabulary, the way the
 * Gherkin lanes scan for `@skip` and friends: a skipped test is collected,
 * counted and never run, and the suite stays green. A `// reason:` comment on
 * the call's line, or alone on the line above it, is the one documented escape,
 * and the call is still reported so a reader sees what is not running.
 */
describe('controlCalls', () => {
  it('finds an it.skip and names its line', () => {
    // Arrange
    const text = ["describe('x', () => {", "  it.skip('later', () => {});", '});'].join(
      '\n',
    );

    // Act
    const calls = controlCalls(text);

    // Assert
    expect(calls).toEqual([{ line: 2, call: 'it.skip', documented: false }]);
  });

  it('finds describe.only, test.todo and bench.skip', () => {
    // Arrange
    const text = [
      "describe.only('x', () => {});",
      "test.todo('y');",
      "bench.skip('z', () => {});",
    ].join('\n');

    // Act
    const calls = controlCalls(text);

    // Assert
    expect(calls.map((c: { call: string }) => c.call)).toEqual([
      'describe.only',
      'test.todo',
      'bench.skip',
    ]);
  });

  it('reports a documented skip as documented, not as absent', () => {
    // Arrange
    const text = "it.skip('flaky upstream', () => {}); // reason: upstream#12";

    // Act
    const calls = controlCalls(text);

    // Assert
    expect(calls).toEqual([{ line: 1, call: 'it.skip', documented: true }]);
  });

  it('accepts a reason comment alone on the line directly above, where Prettier leaves it', () => {
    // Arrange
    const text = [
      '  // reason: no build to read',
      "  it.skipIf(!BUILT)('reads', () => {});",
    ].join('\n');

    // Act
    const calls = controlCalls(text);

    // Assert
    expect(calls).toEqual([{ line: 2, call: 'it.skipIf', documented: true }]);
  });

  it('does not treat a reason comment further away as documentation', () => {
    // Arrange
    const text = ['// reason: not yet', '', "it.skip('later', () => {});"].join('\n');

    // Act
    const calls = controlCalls(text);

    // Assert
    expect(calls[0].documented).toBe(false);
  });

  it('does not treat a reason after code on the line above as documentation', () => {
    // Arrange
    const text = [
      'const x = 1; // reason: unrelated',
      "it.skip('later', () => {});",
    ].join('\n');

    // Act
    const calls = controlCalls(text);

    // Assert
    expect(calls[0].documented).toBe(false);
  });

  it('finds the chained and conditional forms', () => {
    // Arrange
    const text = [
      "it.only.each([1])('x', () => {});",
      "test.skip.each([1])('x', () => {});",
      "describe.concurrent.only('x', () => {});",
      "it.skipIf(true)('x', () => {});",
      "test.runIf(false)('x', () => {});",
    ].join('\n');

    // Act
    const calls = controlCalls(text);

    // Assert
    expect(calls.map((c: { call: string }) => c.call)).toEqual([
      'it.only',
      'test.skip',
      'describe.only',
      'it.skipIf',
      'test.runIf',
    ]);
  });

  it('does not read describe.each or it.each alone as a control call', () => {
    // Arrange
    const text = [
      "describe.each([1])('x', () => {});",
      "it.each([1])('y', () => {});",
    ].join('\n');

    // Act
    const calls = controlCalls(text);

    // Assert
    expect(calls).toEqual([]);
  });

  it('ignores the words inside strings, mid-line and in other identifiers', () => {
    // Arrange
    const text = [
      "expect(label).toBe('it.skip(');",
      "const only = 'describe.only';",
      'schedule.skip(1);',
      "const run = () => it.skip('mid-line', () => {});",
      "it('runs', () => {});",
    ].join('\n');

    // Act
    const calls = controlCalls(text);

    // Assert
    expect(calls).toEqual([]);
  });

  it('finds a call with a space before the parenthesis', () => {
    // Arrange
    const text = "it.only ('spaced', () => {});";

    // Act
    const calls = controlCalls(text);

    // Assert
    expect(calls).toHaveLength(1);
  });
});

describe('scannedFiles', () => {
  let root: string | undefined;

  afterEach(() => {
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  /** A tree with one test file per scanned directory, plus the given extras. */
  function fixture(extra: string[] = []): string {
    const dir = mkdtempSync(join(tmpdir(), 'vitest-control-scan-'));
    const files = [
      'apps/a/__tests__/a.test.tsx',
      'packages/p/src/deep/p.test.ts',
      'scripts/__tests__/s.test.ts',
      '.sandcastle/__tests__/c.test.ts',
      ...extra,
    ];
    for (const file of files) {
      mkdirSync(join(dir, file, '..'), { recursive: true });
      writeFileSync(join(dir, file), "it('x', () => {});\n");
    }
    return dir;
  }

  it('reads every scanned directory, a `*` meaning each workspace', () => {
    // Arrange
    root = fixture(['apps/b/__tests__/b.test.mjs', 'apps/b/src/not-scanned.test.ts']);

    // Act
    const { files, empty } = scannedFiles(root);

    // Assert
    const relative = files.map((file: string) => file.slice(root!.length + 1)).sort();
    expect(relative).toEqual([
      '.sandcastle/__tests__/c.test.ts',
      'apps/a/__tests__/a.test.tsx',
      'apps/b/__tests__/b.test.mjs',
      'packages/p/src/deep/p.test.ts',
      'scripts/__tests__/s.test.ts',
    ]);
    expect(empty).toEqual([]);
  });

  it('never descends into a node_modules', () => {
    // Arrange
    root = fixture(['packages/p/src/node_modules/dep/dep.test.ts']);

    // Act
    const { files } = scannedFiles(root);

    // Assert
    expect(files.some((file: string) => file.includes('node_modules'))).toBe(false);
  });

  it('names a scanned directory that holds no test file, so the scan cannot go blind', () => {
    // Arrange
    root = mkdtempSync(join(tmpdir(), 'vitest-control-scan-'));
    mkdirSync(join(root, 'scripts/__tests__'), { recursive: true });
    writeFileSync(join(root, 'scripts/__tests__/s.test.ts'), '');

    // Act
    const { empty } = scannedFiles(root);

    // Assert
    expect(empty).toEqual([
      'apps/*/__tests__',
      'packages/*/src',
      '.sandcastle/__tests__',
    ]);
  });
});
