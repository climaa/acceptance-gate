#!/usr/bin/env node
// @ts-check
//
// argv in, exit code out. No `commander`: the whole surface is two subcommands and two
// flags, and a dependency that parses them would be larger than the file that uses it.
//
// Anything this file cannot make sense of is `EXIT.broken` with the usage on stderr —
// never a run with the unreadable argument dropped. A typo'd `--filter` silently
// capturing the whole corpus, or a typo'd command silently running `check`, is a gate
// that answered a question nobody asked.

import { ALLOW_HOST_MISMATCH_ENV, accept, check } from './commands.mjs';
import { EXIT } from './policy.mjs';

/** @typedef {import('./commands.mjs').CommandResult} CommandResult */
/** @typedef {import('./commands.mjs').Options} Options */
/** @typedef {(deps?: undefined, opts?: Options) => Promise<CommandResult>} Command */

/** @type {Record<string, Command>} */
const COMMANDS = { check, accept };

/** `check` is the default: the gate is run far more often than it is accepted, and the
 *  accepting one is the one that should have to be named. */
const DEFAULT_COMMAND = 'check';

export const USAGE = [
  'Usage: visual-diff [check|accept] [options]',
  '',
  '  check   capture the corpus and compare it against the committed baselines',
  '  accept  capture the corpus and commit it as the new baselines',
  '',
  '  --filter <substring>    only stories whose id or title contains it',
  '  --allow-host-mismatch   compare against baselines captured on another host',
  `                          (or ${ALLOW_HOST_MISMATCH_ENV}=1)`,
  '',
  `Exit codes: ${EXIT.ok} unchanged · ${EXIT.diff} a human must look · ${EXIT.broken} the gate is broken`,
].join('\n');

/** @typedef {{ command: string, filter?: string, allowHostMismatch: boolean,
 *              error?: string }} ParsedArgs */

/** @param {string} argument @param {string[]} rest */
function readFilter(argument, rest) {
  const inline = argument.startsWith('--filter=')
    ? argument.slice('--filter='.length)
    : rest.shift();
  if (!inline) throw new Error('--filter needs a substring to match stories against');

  return inline;
}

/** argv (already stripped of `node` and the script) → what to run.
 *
 *  A single pass over a mutable copy, so `--filter button` and `--filter=button` are one
 *  branch rather than two parsers.
 *  @param {readonly string[]} argv @returns {ParsedArgs} */
export function parseArgs(argv) {
  /** @type {ParsedArgs} */
  const parsed = { command: DEFAULT_COMMAND, allowHostMismatch: false };
  const rest = [...argv];
  let named = false;

  try {
    while (rest.length > 0) {
      const argument = /** @type {string} */ (rest.shift());

      if (argument === '--allow-host-mismatch') parsed.allowHostMismatch = true;
      else if (argument.startsWith('--filter'))
        parsed.filter = readFilter(argument, rest);
      else if (argument.startsWith('-')) throw new Error(`unknown option ${argument}`);
      else if (named) throw new Error(`unexpected argument ${argument}`);
      else {
        if (!(argument in COMMANDS)) throw new Error(`unknown command ${argument}`);
        parsed.command = argument;
        named = true;
      }
    }
  } catch (cause) {
    parsed.error = /** @type {Error} */ (cause).message;
  }

  return parsed;
}

/** @typedef {{ out: (line: string) => void, err: (line: string) => void }} Io */

/** @type {Io} */
const CONSOLE_IO = {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
};

/** Run one command and report it.
 *
 *  The verdict goes to stdout and a broken gate to stderr: a red CI job is read from its
 *  error stream first, and "the corpus never built" is not a diff report.
 *  @param {readonly string[]} argv @param {Io} [io]
 *  @param {Record<string, Command>} [commands] @returns {Promise<number>} */
export async function run(argv, io = CONSOLE_IO, commands = COMMANDS) {
  const parsed = parseArgs(argv);
  if (parsed.error) {
    io.err(`${parsed.error}\n\n${USAGE}`);
    return EXIT.broken;
  }

  const { exitCode, message } = await commands[parsed.command](undefined, {
    filter: parsed.filter,
    allowHostMismatch: parsed.allowHostMismatch,
  });

  if (message) (exitCode === EXIT.broken ? io.err : io.out)(message);
  return exitCode;
}

// Only when this file *is* the process: the suite imports it, and a module that runs the
// gate on import would capture a corpus every time a test asks how it parses a flag.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await run(process.argv.slice(2));
}
