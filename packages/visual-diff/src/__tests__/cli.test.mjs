import { describe, expect, it } from 'vitest';

import { USAGE, parseArgs, run } from '../cli.mjs';
import { EXIT } from '../policy.mjs';

/** Stand-ins for `commands.mjs`: the CLI's whole job is argv in, exit code out, and the
 *  commands themselves are that module's own suite. */
function fakeCommands(result = { exitCode: EXIT.ok, message: 'clean' }) {
  /** @type {{ name: string, opts: object }[]} */
  const calls = [];

  const record = (name) => async (_deps, opts) => {
    calls.push({ name, opts });
    return result;
  };

  return { calls, check: record('check'), accept: record('accept') };
}

function fakeIo() {
  /** @type {string[]} */
  const out = [];
  /** @type {string[]} */
  const err = [];

  return {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    lines: { out, err },
  };
}

describe('parseArgs', () => {
  it('runs check when no command is named', () => {
    expect(parseArgs([]).command).toBe('check');
  });

  it('still runs check when only a flag is given', () => {
    expect(parseArgs(['--filter', 'button']).command).toBe('check');
  });

  it('reads --filter in both spellings', () => {
    expect(parseArgs(['--filter', 'button']).filter).toBe('button');
    expect(parseArgs(['check', '--filter=button']).filter).toBe('button');
  });

  it('refuses --filter with no value, rather than capturing the whole corpus', () => {
    expect(parseArgs(['check', '--filter']).error).toBeTruthy();
  });

  it('refuses a near-miss of --filter, rather than eating the word after it', () => {
    // `--filters button` reading as `--filter button` is the same silent misfire as a
    // dropped flag: the run narrows to whatever the typo swallowed and still exits 0.
    const parsed = parseArgs(['check', '--filters', 'button']);

    expect(parsed.error).toContain('--filters');
    expect(parsed.filter).toBeUndefined();
  });

  it('reads --allow-host-mismatch as the flag it is', () => {
    expect(parseArgs(['check', '--allow-host-mismatch']).allowHostMismatch).toBe(true);
  });

  it('leaves the mismatch disallowed unless it is asked for', () => {
    expect(parseArgs(['accept']).allowHostMismatch).toBe(false);
  });

  it('refuses an unknown command', () => {
    expect(parseArgs(['approve']).error).toContain('approve');
  });

  it('refuses an unknown flag', () => {
    expect(parseArgs(['check', '--force']).error).toContain('--force');
  });

  it('refuses a second command, which would hide one of the two', () => {
    expect(parseArgs(['check', 'accept']).error).toBeTruthy();
  });
});

describe('run', () => {
  it('dispatches to check by default', async () => {
    const commands = fakeCommands();

    await run([], fakeIo(), commands);

    expect(commands.calls.map((call) => call.name)).toEqual(['check']);
  });

  it('dispatches to accept when it is named', async () => {
    const commands = fakeCommands();

    await run(['accept'], fakeIo(), commands);

    expect(commands.calls.map((call) => call.name)).toEqual(['accept']);
  });

  it('hands --filter and --allow-host-mismatch to the command', async () => {
    const commands = fakeCommands();

    await run(['--filter', 'button', '--allow-host-mismatch'], fakeIo(), commands);

    expect(commands.calls[0].opts).toMatchObject({
      filter: 'button',
      allowHostMismatch: true,
    });
  });

  it.each([EXIT.ok, EXIT.diff, EXIT.broken])('propagates exit code %i', async (code) => {
    const commands = fakeCommands({ exitCode: code, message: 'done' });

    const exitCode = await run([], fakeIo(), commands);

    expect(exitCode).toBe(code);
  });

  it('prints the verdict of a run that produced one to stdout', async () => {
    const commands = fakeCommands({
      exitCode: EXIT.diff,
      message: '3 variants need review',
    });
    const io = fakeIo();

    await run([], io, commands);

    expect(io.lines.out).toEqual(['3 variants need review']);
  });

  it('prints a broken gate to stderr, where a CI log reader looks for it', async () => {
    const commands = fakeCommands({
      exitCode: EXIT.broken,
      message: 'no Storybook build',
    });
    const io = fakeIo();

    await run([], io, commands);

    expect(io.lines.err).toEqual(['no Storybook build']);
    expect(io.lines.out).toEqual([]);
  });

  it('answers an unusable argv with the usage and a broken gate, running nothing', async () => {
    const commands = fakeCommands();
    const io = fakeIo();

    const exitCode = await run(['approve'], io, commands);

    expect(exitCode).toBe(EXIT.broken);
    expect(io.lines.err.join('\n')).toContain(USAGE);
    expect(commands.calls).toEqual([]);
  });
});
