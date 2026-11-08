import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

// @ts-expect-error — plain .mjs with JSDoc types, no declaration file.
import { CHECKS } from '../gate/manifest.mjs';

/**
 * The gate's `test` check bounds turbo's concurrency to half the logical
 * processors, so every workspace's vitest does not start at once on a loaded
 * machine; a TURBO_CONCURRENCY already set (the sandbox's) is passed through
 * rather than overridden. The command runs through a shell, as run.mjs runs it,
 * with `echo` in place of pnpm so the test reads the flag turbo would get.
 */
describe('the gate test check', () => {
  const command: string = CHECKS.find(
    (check: { name: string }) => check.name === 'test',
  ).command;

  function expand(env: Record<string, string>) {
    const { TURBO_CONCURRENCY: _, ...rest } = process.env;

    return spawnSync(`echo ${command}`, {
      shell: true,
      encoding: 'utf8',
      env: { ...rest, ...env },
    }).stdout.trim();
  }

  it('asks turbo for half the logical processors when nothing else bounds it', () => {
    // Arrange
    const env = {};

    // Act
    const line = expand(env);

    // Assert
    expect(line).toBe('pnpm turbo run test --concurrency=50%');
  });

  it('passes an exported TURBO_CONCURRENCY through instead of overriding it', () => {
    // Arrange
    const env = { TURBO_CONCURRENCY: '3' };

    // Act
    const line = expand(env);

    // Assert
    expect(line).toBe('pnpm turbo run test --concurrency=3');
  });
});
