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
import { promote } from './promote.mjs';
import { EXIT } from './policy.mjs';

/** @typedef {import('./commands.mjs').CommandResult} CommandResult */
/** @typedef {import('./commands.mjs').Options} Options */
/** @typedef {(deps?: undefined, opts?: Options) => Promise<CommandResult>} Command */

/** @type {Record<string, Command>} */
const COMMANDS = { check, accept, promote };

/** `check` is the default: the gate is run far more often than it is accepted, and the
 *  accepting one is the one that should have to be named. */
const DEFAULT_COMMAND = 'check';

export const USAGE = [
  'Usage: visual-diff [check|accept|promote] [options]',
  '',
  '  check    capture the corpus and compare it against the committed baselines',
  '  accept   capture the corpus and commit it as the new baselines',
  "  promote  copy one report's candidates into a data directory's corpus",
  '',
  '  --filter <substring>    only stories whose id or title contains it',
  '  --allow-host-mismatch   compare against baselines captured on another host',
  `                          (or ${ALLOW_HOST_MISMATCH_ENV}=1)`,
  '  --data-dir <path>       promote: the tree holding reports/ and __baselines__',
  '  --report <id>           promote: which report to promote the candidates of',
  '',
  `Exit codes: ${EXIT.ok} unchanged · ${EXIT.diff} a human must look · ${EXIT.broken} the gate is broken`,
].join('\n');

/** @typedef {{ command: string, filter?: string, allowHostMismatch: boolean,
 *              dataDir?: string, reportId?: string, error?: string }} ParsedArgs */

/** The flags that take a value, and what each is called when it arrives without one.
 *  A table rather than three branches: every one of them is read the same two ways. */
const VALUED = {
  '--filter': ['filter', 'a substring to match stories against'],
  '--data-dir': ['dataDir', 'the path of a data directory'],
  '--report': ['reportId', 'the id of a report to promote'],
};

/** The value of a valued flag, whichever spelling it arrived in. `rest` is the argv still
 *  to be read, so the separated spelling consumes the word after the flag.
 *  @param {string} flag @param {string} argument @param {string[]} rest
 *  @returns {string} */
function readValue(flag, argument, rest) {
  const assignment = `${flag}=`;
  const value = argument.startsWith(assignment)
    ? argument.slice(assignment.length)
    : rest.shift();
  if (!value) throw new Error(`${flag} needs ${VALUED[flag][1]}`);

  return value;
}

/** Which valued flag an argument is, or null. Matches `--flag` and `--flag=value`
 *  without matching `--flagged`.
 *  @param {string} argument @returns {string | null} */
function valuedFlag(argument) {
  return (
    Object.keys(VALUED).find(
      (flag) => argument === flag || argument.startsWith(`${flag}=`),
    ) ?? null
  );
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

      const flag = valuedFlag(argument);

      if (argument === '--allow-host-mismatch') parsed.allowHostMismatch = true;
      else if (flag) parsed[VALUED[flag][0]] = readValue(flag, argument, rest);
      else if (argument.startsWith('-')) throw new Error(`unknown option ${argument}`);
      else if (named) throw new Error(`unexpected argument ${argument}`);
      else if (!(argument in COMMANDS)) throw new Error(`unknown command ${argument}`);
      else {
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
    dataDir: parsed.dataDir,
    reportId: parsed.reportId,
  });

  const report = exitCode === EXIT.broken ? io.err : io.out;
  if (message) report(message);

  return exitCode;
}

// Only when this file *is* the process: the suite imports it, and a module that runs the
// gate on import would capture a corpus every time a test asks how it parses a flag.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await run(process.argv.slice(2));
}
