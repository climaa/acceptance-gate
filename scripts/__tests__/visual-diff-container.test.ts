import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// @ts-expect-error — plain .mjs with JSDoc types, no declaration file.
import { run, STORYBOOK_BUILD } from '../visual-diff-container.mjs';
// @ts-expect-error — plain .mjs with JSDoc types, no declaration file.
import { EXIT, HOST } from '../../packages/visual-diff/src/policy.mjs';

/**
 * A capture reads `storybook-static` as it is on disk. On 5 Oct 2026 an accept
 * ran on a build from before the merge that fixed the mobile header, and wrote
 * the broken header as the new baseline. The wrapper now brings the build up to
 * date through turbo before the container starts, and captures nothing when it
 * cannot.
 *
 * Asserted against a stand-in for spawn rather than Docker and turbo: the
 * decisions are what runs, in which order, and whether the capture starts.
 */
type Call = { command: string; args: readonly string[] };
type Result = { status: number | null; error?: Error };

function fakeSpawn(results: Record<string, Result>): {
  spawn: (command: string, args: readonly string[]) => Result;
  calls: Call[];
} {
  const calls: Call[] = [];
  return {
    calls,
    spawn: (command, args) => {
      calls.push({ command, args });
      return results[command] ?? { status: 0 };
    },
  };
}

describe('visual-diff-container', () => {
  beforeEach(() => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds Storybook through turbo before it starts the container', () => {
    // Arrange
    const { spawn, calls } = fakeSpawn({});

    // Act
    const code = run(['accept', '--filter', 'siteheader'], { spawn, exists: () => true });

    // Assert
    expect(code).toBe(0);
    expect(calls.map((call) => call.command)).toEqual(['pnpm', 'docker']);
    expect(calls[0]?.args).toEqual(STORYBOOK_BUILD);
    expect(STORYBOOK_BUILD).toEqual([
      'turbo',
      'run',
      'build',
      '--filter=@gate/storybook',
    ]);
  });

  it('passes every argument to the CLI in the pinned image, verbatim', () => {
    // Arrange
    const { spawn, calls } = fakeSpawn({});

    // Act
    run(['check', '--filter', 'siteheader'], { spawn, exists: () => true });

    // Assert
    const docker = calls[1]?.args ?? [];
    const image = docker.indexOf(HOST.image);
    expect(docker.slice(image)).toEqual([
      HOST.image,
      'node',
      'packages/visual-diff/src/cli.mjs',
      'check',
      '--filter',
      'siteheader',
    ]);
  });

  it('captures nothing when the build fails', () => {
    // Arrange
    const { spawn, calls } = fakeSpawn({ pnpm: { status: 1 } });

    // Act
    const code = run(['accept'], { spawn, exists: () => true });

    // Assert
    expect(code).toBe(EXIT.broken);
    expect(calls.map((call) => call.command)).toEqual(['pnpm']);
  });

  it('captures nothing when the build cannot be started', () => {
    // Arrange
    const { spawn, calls } = fakeSpawn({
      pnpm: { status: null, error: new Error('ENOENT') },
    });

    // Act
    const code = run(['accept'], { spawn, exists: () => true });

    // Assert
    expect(code).toBe(EXIT.broken);
    expect(calls.map((call) => call.command)).toEqual(['pnpm']);
  });

  it('captures nothing when the build leaves no storybook-static', () => {
    // Arrange
    const { spawn, calls } = fakeSpawn({});

    // Act
    const code = run(['accept'], { spawn, exists: () => false });

    // Assert
    expect(code).toBe(EXIT.broken);
    expect(calls.map((call) => call.command)).toEqual(['pnpm']);
  });

  it('reports a missing Docker as broken rather than falling back to bare metal', () => {
    // Arrange
    const { spawn } = fakeSpawn({ docker: { status: null, error: new Error('ENOENT') } });

    // Act
    const code = run(['accept'], { spawn, exists: () => true });

    // Assert
    expect(code).toBe(EXIT.broken);
  });

  it('returns the CLI exit code, so a check that finds a diff still says so', () => {
    // Arrange
    const { spawn } = fakeSpawn({ docker: { status: 1 } });

    // Act
    const code = run(['check'], { spawn, exists: () => true });

    // Assert
    expect(code).toBe(1);
  });
});
